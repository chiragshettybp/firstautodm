import * as React from 'react'

import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

/**
 * StatCard — the single number tile used on the dashboard.
 *
 * Renders `<h3>` for the value so document outline stays sensible even when a
 * page already has an `<h1>`. When the value loads in, pass `live` to announce
 * the change exactly once.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  live = false,
  className,
  ...props
}: React.ComponentProps<typeof Card> & {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger'
  live?: boolean
}) {
  return (
    <Card
      data-slot="stat-card"
      data-tone={tone}
      className={cn('gap-2 p-4 sm:p-5', className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium tracking-[0.08em] text-muted-text uppercase">
          {label}
        </span>
        {icon ? (
          <span
            aria-hidden="true"
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4',
              tone === 'brand' && 'bg-brand-soft text-brand-soft-foreground',
              tone === 'success' && 'bg-success-soft text-success-soft-foreground',
              tone === 'warning' && 'bg-warning-soft text-warning-soft-foreground',
              tone === 'danger' && 'bg-danger-soft text-danger-soft-foreground',
              tone === 'neutral' && 'bg-surface-secondary text-muted-text',
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <h3
        {...(live ? { 'aria-live': 'polite' as const } : {})}
        className="tnum text-3xl leading-9 font-bold tracking-[-0.03em]"
      >
        {value}
      </h3>
      {hint ? <p className="text-sm leading-5 text-muted-text">{hint}</p> : null}
    </Card>
  )
}