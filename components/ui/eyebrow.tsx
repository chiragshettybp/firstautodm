import { cn } from '@/lib/utils'

/**
 * Eyebrow — the one label style above a heading or card title. Optional, but
 * only ever one accent-tinted word inside the label.
 *
 * Renders as a `<span>` so it can sit inside a heading without altering the
 * document outline. Wrap in a `<p>` if a block-level label is needed.
 */
export function Eyebrow({
  className,
  children,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="eyebrow"
      className={cn(
        'block text-xs font-bold tracking-[0.15em] text-muted-text uppercase',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}