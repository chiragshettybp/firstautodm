import * as React from 'react'

import { cn } from '@/lib/utils'
import { Eyebrow } from '@/components/ui/eyebrow'

/**
 * PageHeader is the standard opening block for every app page.
 *
 * Opt into a live region only when the title reflects async state (e.g. a
 * count that loads in) so screen readers announce the change exactly once.
 */
export interface PageHeaderProps
  extends Omit<React.ComponentProps<'header'>, 'title'> {
  /** Small label above the title. */
  eyebrow?: React.ReactNode
  /** Rendered as `<h1>`. If omitted the page must supply its own h1. */
  title?: React.ReactNode
  description?: React.ReactNode
  /** Buttons and controls, right-aligned on desktop, stacked below on mobile. */
  action?: React.ReactNode
  /** Announce title changes to assistive tech. Use for async titles only. */
  live?: boolean
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  live = false,
  className,
  ...props
}: PageHeaderProps) {
  const Heading = 'h1'

  return (
    <header
      data-slot="page-header"
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        {title ? (
          <Heading
            {...(live ? { 'aria-live': 'polite' as const } : {})}
            className="text-2xl leading-8 font-bold tracking-[-0.03em] text-balance sm:text-3xl sm:leading-9"
          >
            {title}
          </Heading>
        ) : null}
        {description ? (
          <p className="max-w-prose text-sm leading-6 text-muted-text">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {action}
        </div>
      ) : null}
    </header>
  )
}