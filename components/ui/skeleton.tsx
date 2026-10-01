import { cn } from '@/lib/utils'

/**
 * Skeletons are the *base* of the 3-step skeleton ramp, not a flashing block.
 * `.skeleton-wash` (globals.css) owns the shimmer keyframes.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('skeleton-wash animate-pulse rounded-[8px]', className)}
      {...props}
    />
  )
}

export { Skeleton }