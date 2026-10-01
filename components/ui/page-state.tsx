import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * EmptyState, ErrorState and LoadingState are the airy page archetype.
 *
 * All three are centred, 44px icon plate, one sentence of guidance and at
 * most one action. Every one of them is a live region: the state change is
 * announced without moving focus.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="empty-state"
      className={cn(
        'page-pad-airy flex flex-col items-center justify-center gap-4 text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-full bg-surface-secondary text-muted-text [&_svg]:size-5"
        >
          {icon}
        </span>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1.5">
        <h2 className="text-lg leading-7 font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-6 text-muted-text text-pretty">
            {description}
          </p>
        ) : null}
        {children}
      </div>
      {action ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  )
}

export function ErrorState({
  icon,
  title = 'Something went wrong',
  description,
  action,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  icon?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        'page-pad-airy flex flex-col items-center justify-center gap-4 text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger-soft-foreground [&_svg]:size-5"
        >
          {icon}
        </span>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1.5">
        <h2 className="text-lg leading-7 font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-6 text-muted-text text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  )
}

/**
 * LoadingState — a centred spinner. It occupies real layout space so the
 * surrounding structure stays stable, and it announces itself once.
 */
export function LoadingState({
  label = 'Loading',
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  label?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="loading-state"
      className={cn(
        'flex min-h-[240px] flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-full bg-surface-secondary text-muted-text"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="size-5 animate-[spin_750ms_linear_infinite]"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="42 14"
            opacity="0.9"
          />
        </svg>
      </span>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}