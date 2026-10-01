import * as React from 'react'

import { cn } from '@/lib/utils'

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand'

const TONE_DOT: Record<StatusTone, string> = {
  neutral: 'bg-muted-text',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  brand: 'bg-brand',
}

const TONE_TEXT: Record<StatusTone, string> = {
  neutral: 'text-muted-text',
  success: 'text-success-soft-foreground',
  warning: 'text-warning-soft-foreground',
  danger: 'text-danger-soft-foreground',
  brand: 'text-brand-soft-foreground',
}

/**
 * StatusPill — 16px compact chip with a leading status dot.
 *
 * All tone information is carried by text, not colour alone. For charts or
 * legend rows pass `dot={false}` and let the caller render its own swatch.
 */
export function StatusPill({
  tone = 'neutral',
  dot = true,
  className,
  children,
  ...props
}: React.ComponentProps<'span'> & {
  tone?: StatusTone
  dot?: boolean
}) {
  return (
    <span
      data-slot="status-pill"
      data-tone={tone}
      className={cn(
        'inline-flex h-4 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        TONE_TEXT[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[tone])}
        />
      ) : null}
      {children}
    </span>
  )
}