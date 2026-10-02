'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  FileAudio,
  Link2,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  Video,
} from 'lucide-react'
import { toast } from 'sonner'

/**
 * Feature 11 — media library picker for the automation editor.
 *
 * Instagram fetches attachments server-side, so a pasted URL is only useful if
 * it is publicly reachable. Uploading through this app guarantees that, and the
 * URL fallback is kept for people who already host files elsewhere.
 *
 * Deliberately does not import `lib/supabase-storage`: that module pulls in the
 * server-only Supabase admin chain. The limits are duplicated here for display
 * only — `uploadMedia` re-validates everything on the server.
 */

interface MediaItem {
  id: string
  url: string
  kind: 'image' | 'video' | 'audio'
  sizeBytes: number
  originalName: string
}

export type MediaPickerKind = 'image' | 'video' | 'audio' | 'any'

const ACCEPT: Record<Exclude<MediaPickerKind, 'any'>, string> = {
  image: 'image/jpeg,image/png,image/gif,image/webp',
  video: 'video/mp4,video/quicktime',
  audio: 'audio/mpeg,audio/mp4,audio/m4a,audio/x-m4a',
}

const LIMIT_LABEL: Record<Exclude<MediaPickerKind, 'any'>, string> = {
  image: '8 MB',
  video: '25 MB',
  audio: '25 MB',
}

const KIND_LABEL: Record<MediaPickerKind, string> = {
  image: 'images',
  video: 'videos',
  audio: 'audio',
  any: 'files',
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface MediaPickerProps {
  userId: string
  value: string
  onChange: (url: string) => void
  kind?: MediaPickerKind
  label?: string
  hint?: string
}

export function MediaPicker({
  userId,
  value,
  onChange,
  kind = 'image',
  label,
  hint,
}: MediaPickerProps) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [urlMode, setUrlMode] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!userId) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/media?userId=${encodeURIComponent(userId)}`)
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setLoadError(json?.error ?? 'Could not load your media library.')
        return
      }
      const rows = Array.isArray(json?.media) ? json.media : []
      setItems(
        rows
          .map((row: Record<string, unknown>) => ({
            id: String(row.id),
            // The list route returns snake_case rows; the upload route returns
            // the camelCase `UploadedMedia` shape.
            url: String(row.public_url ?? row.url ?? ''),
            kind: String(row.kind ?? 'image') as MediaItem['kind'],
            sizeBytes: Number(row.size_bytes ?? row.sizeBytes ?? 0),
            originalName: String(row.original_name ?? row.originalName ?? ''),
          }))
          .filter((item: MediaItem) => Boolean(item.url)),
      )
    } catch {
      setLoadError('You appear to be offline. Your library will load when you reconnect.')
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  // A pasted URL is not in the library, so show the manual field when the rule
  // already holds one we did not upload.
  useEffect(() => {
    if (!value) return
    if (!items.some((item) => item.url === value)) setUrlMode(true)
  }, [value, items])

  const visible = kind === 'any' ? items : items.filter((item) => item.kind === kind)

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('userId', userId)
      form.append('file', file)

      const res = await fetch('/api/media/upload', { method: 'POST', body: form })
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        toast.error(json?.error ?? 'Upload failed')
        return
      }

      const media = json?.media
      onChange(String(media?.url ?? ''))
      setUrlMode(false)
      toast.success('Upload complete')
      void load()
    } catch {
      toast.error('Network error — the upload did not finish.')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const handleDelete = async (item: MediaItem) => {
    setDeletingId(item.id)
    try {
      const res = await fetch(
        `/api/media/${item.id}?userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        toast.error(json?.error ?? 'Could not delete that file.')
        return
      }
      if (value === item.url) onChange('')
      setItems((current) => current.filter((entry) => entry.id !== item.id))
      toast.success('File deleted')
    } catch {
      toast.error('Network error — nothing was deleted.')
    } finally {
      setDeletingId(null)
    }
  }

  const inputId = `media-picker-${kind}-${label ? label.replace(/\W+/g, '-').toLowerCase() : 'field'}`

  return (
    <div className="space-y-3">
      {label ? (
        <p className="mb-2 text-[9px] font-bold tracking-[0.18em] text-muted-text uppercase">
          {label}
        </p>
      ) : null}

      <input
        ref={fileInput}
        id={inputId}
        type="file"
        className="sr-only"
        accept={kind === 'any' ? undefined : ACCEPT[kind]}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleUpload(file)
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className="button button--outline button--sm cursor-pointer"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {uploading ? 'Uploading…' : `Upload ${KIND_LABEL[kind]}`}
        </label>
        {kind !== 'any' ? (
          <span className="text-[10px] text-muted-text">
            up to {LIMIT_LABEL[kind]}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setUrlMode((current) => !current)}
          aria-pressed={urlMode}
          className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-text transition-colors hover:text-foreground"
        >
          <Link2 className="size-3.5" aria-hidden="true" />
          {urlMode ? 'Hide link input' : 'Use a link instead'}
        </button>
      </div>

      {urlMode ? (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/file.jpg"
          aria-label={label ?? 'Media URL'}
          aria-invalid={value.length > 0 && !/^https?:\/\/\S+$/i.test(value)}
          className="field h-11 text-xs"
        />
      ) : null}

      {value ? (
        <div className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface-secondary p-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-surface">
            {kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt="" className="size-full object-cover" />
            ) : kind === 'video' ? (
              <Video className="size-4 text-muted-text" aria-hidden="true" />
            ) : (
              <FileAudio className="size-4 text-muted-text" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold text-foreground">
              Selected
            </span>
            <span className="block truncate text-[10px] text-muted-text">{value}</span>
          </span>
          <button
            type="button"
            onClick={() => onChange('')}
            className="press-subtle p-1.5 text-muted-text transition-colors hover:text-danger"
            aria-label="Clear selection"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-[12px] border border-dashed border-border bg-surface-secondary px-3 py-4 text-[11px] text-muted-text"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading your media library…
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-[12px] border border-danger-soft bg-danger-soft px-3 py-3 text-[11px] text-danger-soft-foreground"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{loadError}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1 font-semibold underline underline-offset-2"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border bg-surface-secondary px-3 py-4 text-[11px] leading-5 text-muted-text">
          No {KIND_LABEL[kind]} uploaded yet. Upload one above, or paste a link.
        </div>
      ) : (
        <ul className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {visible.map((item) => {
            const isSelected = item.url === value
            return (
              <li key={item.id} className="relative">
                <button
                  type="button"
                  onClick={() => onChange(item.url)}
                  aria-pressed={isSelected}
                  aria-label={`Use ${item.originalName || 'uploaded file'}`}
                  className={`group relative block aspect-square w-full overflow-hidden rounded-[10px] border bg-neutral-900 transition-colors ${
                    isSelected
                      ? 'border-brand ring-2 ring-brand/30'
                      : 'border-border hover:border-foreground/40'
                  }`}
                >
                  {item.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-1.5 text-neutral-500">
                      {item.kind === 'video' ? (
                        <Video className="size-6" aria-hidden="true" />
                      ) : (
                        <FileAudio className="size-6" aria-hidden="true" />
                      )}
                      <span className="text-[9px] font-bold tracking-wider uppercase">
                        {item.kind}
                      </span>
                    </span>
                  )}
                  {isSelected ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-brand/25">
                      <span className="check-pop flex size-7 items-center justify-center rounded-full bg-brand text-brand-foreground ring-2 ring-brand-foreground">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(item)}
                  disabled={deletingId === item.id}
                  aria-label={`Delete ${item.originalName || 'uploaded file'}`}
                  className="absolute top-1 right-1 rounded-full bg-black/70 p-1.5 text-white/80 transition-colors hover:bg-danger hover:text-white disabled:opacity-50"
                >
                  {deletingId === item.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                </button>
                <p className="mt-1 truncate text-[9px] text-muted-text">
                  {item.originalName || 'Untitled'}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      {hint ? <p className="text-[10px] leading-4 text-muted-text">{hint}</p> : null}
    </div>
  )
}