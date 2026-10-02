import crypto from "crypto"
import type { SupabaseClient } from "./supabase-admin"
import { ApiError } from "./ownership"

/**
 * Feature 11 — Supabase Storage for DM media.
 *
 * Instagram fetches media server-side when delivering a message, so the object
 * must be reachable from a public URL. Objects are namespaced `{userId}/{uuid}`
 * which lets ownership be proven from the path alone.
 */

export const MEDIA_BUCKET = "dm-media"

/** Instagram's own limits. Rejecting here gives a clear message instead of a
 *  confusing send-time failure. */
export const MEDIA_LIMITS = {
  image: { maxBytes: 8 * 1024 * 1024, label: "8 MB" },
  video: { maxBytes: 25 * 1024 * 1024, label: "25 MB" },
  audio: { maxBytes: 25 * 1024 * 1024, label: "25 MB" },
} as const

export type MediaKind = keyof typeof MEDIA_LIMITS

const ALLOWED: Record<MediaKind, string[]> = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  video: ["video/mp4", "video/quicktime"],
  audio: ["audio/mpeg", "audio/mp4", "audio/m4a", "audio/x-m4a"],
}

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
}

export function classifyMedia(mimeType: string): MediaKind | null {
  const type = mimeType.toLowerCase().split(";")[0].trim()
  for (const kind of Object.keys(ALLOWED) as MediaKind[]) {
    if (ALLOWED[kind].includes(type)) return kind
  }
  return null
}

export function assertAcceptable(mimeType: string, sizeBytes: number): MediaKind {
  const kind = classifyMedia(mimeType)
  if (!kind) {
    throw new ApiError(
      415,
      "Instagram accepts JPEG, PNG, GIF and WebP images, MP4 or MOV video, and MP3 or M4A audio.",
      "unsupported_media_type",
    )
  }
  const limit = MEDIA_LIMITS[kind]
  if (sizeBytes > limit.maxBytes) {
    const mb = (sizeBytes / (1024 * 1024)).toFixed(1)
    throw new ApiError(
      413,
      `That ${kind} is ${mb} MB. Instagram allows up to ${limit.label} for ${kind}.`,
      "media_too_large",
    )
  }
  if (sizeBytes === 0) {
    throw new ApiError(400, "That file is empty.", "empty_file")
  }
  return kind
}

/**
 * Create the bucket if it is missing.
 *
 * Idempotent, and called from the upload route rather than relied on at
 * deploy time so a fresh project works without a manual step. The matching
 * DDL is also in schema.sql for the SQL-editor path.
 */
export async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.storage.getBucket(MEDIA_BUCKET)
  if (error || !data) {
    const { error: createError } = await supabase.storage.createBucket(MEDIA_BUCKET, {
      public: true,
      fileSizeLimit: MEDIA_LIMITS.video.maxBytes,
      allowedMimeTypes: [
        ...ALLOWED.image,
        ...ALLOWED.video,
        ...ALLOWED.audio,
      ],
    })
    if (createError) {
      console.warn("[storage] could not create bucket:", createError.message)
    }
  }
}

export interface UploadedMedia {
  id: string
  url: string
  kind: MediaKind
  mimeType: string
  sizeBytes: number
  path: string
  originalName: string
}

export async function uploadMedia(
  supabase: SupabaseClient,
  ownerId: string,
  file: File,
): Promise<UploadedMedia> {
  const kind = assertAcceptable(file.type, file.size)
  await ensureBucket(supabase)

  const extension = EXTENSION[file.type.toLowerCase().split(";")[0].trim()] ?? "bin"
  // The path is the ownership boundary: `{userId}/{uuid}.{ext}`.
  const objectPath = `${ownerId}/${crypto.randomUUID()}.${extension}`

  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(objectPath, bytes, { contentType: file.type, upsert: false })

  if (uploadError) {
    throw new ApiError(500, `Upload failed: ${uploadError.message}`, "upload_failed")
  }

  const { data: publicData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(objectPath)
  const publicUrl = publicData?.publicUrl
  if (!publicUrl) {
    throw new ApiError(500, "Upload succeeded but no public URL was returned.", "upload_url_missing")
  }

  const { data: record, error: insertError } = await supabase
    .from("uploaded_media")
    .insert({
      user_id: ownerId,
      bucket: MEDIA_BUCKET,
      object_path: objectPath,
      public_url: publicUrl,
      mime_type: file.type,
      kind,
      size_bytes: file.size,
      original_name: file.name.slice(0, 200),
    })
    .select("id")
    .single()

  if (insertError) {
    // Don't leave an orphaned object behind if bookkeeping failed.
    await supabase.storage.from(MEDIA_BUCKET).remove([objectPath])
    throw new ApiError(500, `Could not record the upload: ${insertError.message}`, "upload_record_failed")
  }

  return {
    id: (record as { id: string }).id,
    url: publicUrl,
    kind,
    mimeType: file.type,
    sizeBytes: file.size,
    path: objectPath,
    originalName: file.name,
  }
}

/**
 * Delete an upload.
 *
 * The row is matched on (id, user_id) *and* the object path is re-checked to
 * start with the owner's folder, so neither a guessed id nor a tampered row can
 * remove somebody else's file.
 */
export async function deleteMedia(
  supabase: SupabaseClient,
  ownerId: string,
  mediaId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("uploaded_media")
    .select("id, bucket, object_path")
    .eq("id", mediaId)
    .eq("user_id", ownerId)
    .maybeSingle()

  if (error) throw new ApiError(500, "Could not find that file.", "lookup_failed")
  if (!data) throw new ApiError(404, "That file no longer exists.", "not_found")

  const row = data as { id: string; bucket: string; object_path: string }
  if (!row.object_path.startsWith(`${ownerId}/`)) {
    throw new ApiError(403, "That file belongs to another account.", "forbidden")
  }

  const { error: removeError } = await supabase.storage.from(row.bucket).remove([row.object_path])
  if (removeError) {
    console.warn("[storage] remove failed:", removeError.message)
  }

  await supabase.from("uploaded_media").delete().eq("id", mediaId).eq("user_id", ownerId)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}