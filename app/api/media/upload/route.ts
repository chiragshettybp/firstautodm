import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin, handle, parseUserId, requireOwner, ApiError } from "@/lib/ownership"
import { uploadMedia, MEDIA_LIMITS } from "@/lib/supabase-storage"

export const dynamic = "force-dynamic"
// A 25 MB video plus multipart overhead needs room above the default limit.
export const maxDuration = 60

/**
 * Upload a file for use in an automation reply.
 *
 * Multipart, with the account id supplied as a form field to match the way the
 * rest of this app identifies the signed-in account.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const supabase = getSupabaseAdmin()

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      throw new ApiError(400, "Expected a multipart upload.", "invalid_form_data")
    }

    const userId = parseUserId(form.get("userId"))
    // Validate ownership before touching Storage or the `uploaded_media` table.
    // Without this the insert fails on the user_id foreign key (a stale session
    // that points at an account row that no longer exists) and leaves an
    // orphaned object behind.
    await requireOwner(supabase, userId)
    const file = form.get("file")

    if (!(file instanceof File)) {
      throw new ApiError(400, "Choose a file to upload.", "file_missing")
    }
    if (file.size === 0) {
      throw new ApiError(400, "That file is empty.", "empty_file")
    }
    // Cheap guard before we read the whole body into memory.
    if (file.size > MEDIA_LIMITS.video.maxBytes) {
      throw new ApiError(
        413,
        `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The maximum is ${MEDIA_LIMITS.video.label}.`,
        "media_too_large",
      )
    }

    const media = await uploadMedia(supabase, userId, file)

    return NextResponse.json({ media }, { status: 201 })
  })
}