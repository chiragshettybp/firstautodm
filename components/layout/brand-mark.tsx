import { cn } from '@/lib/utils'

/**
 * BrandMark — the single accent, used as an identity chip.
 *
 * The square yellow plate with a bolt is the one place the accent appears as a
 * solid fill outside of primary actions, and it is duplicated across marketing
 * and product on purpose: the logo *is* the brand colour.
 */
export function BrandMark({
  className,
  iconClassName,
}: {
  className?: string
  iconClassName?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-brand text-brand-foreground',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn('size-4', iconClassName)}
      >
        <path d="M13.5 2.5 4 13.2a.6.6 0 0 0 .47.98H10l-.5 7.32a.6.6 0 0 0 1.09.4L20 11.3a.6.6 0 0 0-.47-.98H14l.5-7.32a.6.6 0 0 0-1.09-.4Z" />
      </svg>
    </span>
  )
}

export function Wordmark({
  className,
  markClassName,
}: {
  className?: string
  markClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark className={markClassName} />
      <span className="text-base leading-6 font-bold tracking-[-0.02em]">
        insta-p8
      </span>
    </span>
  )
}