/**
 * Route-level fallback for every navigation that does not resolve instantly.
 *
 * Mirrors the shape of a typical app page (header block + content rows) so the
 * transition into real content does not shift the layout, and announces itself
 * once for screen readers.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-5xl space-y-6"
    >
      <span className="sr-only">Loading</span>

      <div className="flex flex-col gap-3">
        <div className="h-3 w-24 animate-pulse rounded-[4px] bg-surface-tertiary" />
        <div className="h-8 w-56 animate-pulse rounded-[8px] bg-surface-tertiary" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-[6px] bg-surface-tertiary" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[104px] animate-pulse rounded-[16px] border border-border bg-card"
          />
        ))}
      </div>

      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[76px] animate-pulse rounded-[16px] border border-border bg-card"
          />
        ))}
      </div>
    </div>
  )
}