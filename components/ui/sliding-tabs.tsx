'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export interface SlidingTabItem<T extends string = string> {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
  /** Screen-reader label when `label` is not plain text. */
  srLabel?: string
  /** Optional count rendered after the label. */
  count?: React.ReactNode
  disabled?: boolean
}

/**
 * Tabs with a measured sliding pill.
 *
 * The pill is absolutely positioned and resized from the active tab's real
 * bounding box, so it works with any label width, font fallback, or dynamic
 * content — no magic numbers. Pointer and keyboard activation are
 * interchangeable: arrows/Home/End move focus AND selection, matching the
 * automatic activation model used by native `<select>`.
 *
 * `data-resizing` suspends the CSS transition during resize so the pill does
 * not lag behind a container reflow.
 */
export function SlidingTabs<T extends string = string>({
  items,
  value,
  onValueChange,
  defaultValue,
  size = 'default',
  className,
  listClassName,
  'aria-label': ariaLabel,
}: {
  items: SlidingTabItem<T>[]
  value?: T
  onValueChange?: (value: T) => void
  defaultValue?: T
  size?: 'default' | 'lg'
  className?: string
  listClassName?: string
  'aria-label'?: string
}) {
  const [internal, setInternal] = React.useState<T | undefined>(
    defaultValue ?? items[0]?.value,
  )
  const isControlled = value !== undefined
  const selected = isControlled ? value : internal

  const listRef = React.useRef<HTMLDivElement>(null)
  const tabRefs = React.useRef(new Map<T, HTMLButtonElement>())

  // Tab indices are computed in DOM order so Home/End and arrows are stable
  // even when the caller reorders or disables tabs.
  const enabled = React.useMemo(
    () => items.filter((i) => !i.disabled),
    [items],
  )

  const [pill, setPill] = React.useState<{
    x: number
    width: number
  } | null>(null)

  const select = React.useCallback(
    (next: T) => {
      if (!isControlled) setInternal(next)
      onValueChange?.(next)
    },
    [isControlled, onValueChange],
  )

  const measure = React.useCallback(() => {
    const node = selected != null ? tabRefs.current.get(selected) : undefined
    const list = listRef.current
    if (!node || !list) {
      setPill(null)
      return
    }
    const nodeBox = node.getBoundingClientRect()
    const listBox = list.getBoundingClientRect()
    // `top` is fixed by CSS (0); only x and width are measured.
    setPill({ x: nodeBox.left - listBox.left, width: nodeBox.width })
  }, [selected])

  React.useLayoutEffect(measure, [measure, items])

  // Track container width, font swaps, and locale changes.
  React.useEffect(() => {
    const list = listRef.current
    if (!list) return
    const ro = new ResizeObserver(() => {
      measure()
    })
    ro.observe(list)
    for (const node of tabRefs.current.values()) ro.observe(node)
    return () => ro.disconnect()
  }, [measure, items])

  // The selected tab may sit outside the scroll viewport on overflow rows.
  React.useEffect(() => {
    const node = selected != null ? tabRefs.current.get(selected) : undefined
    node?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selected])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (enabled.length === 0) return
    const currentIndex = enabled.findIndex((i) => i.value === selected)
    let nextIndex: number | null = null

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1 + enabled.length) % enabled.length
        break
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + enabled.length) % enabled.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = enabled.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    const next = enabled[nextIndex]
    select(next.value)
    tabRefs.current.get(next.value)?.focus()
  }

  return (
    <div
      className={cn('t-tabs', size === 'lg' && 't-tabs-lg', className)}
      onKeyDown={onKeyDown}
    >
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        className={cn('t-tabs-scroll', listClassName)}
      >
        {pill ? (
          <span
            aria-hidden="true"
            data-slot="t-tabs-pill"
            className="t-tabs-pill"
            style={{ transform: `translateX(${pill.x}px)`, width: pill.width }}
          />
        ) : null}
        {items.map((item) => {
          const isSelected = item.value === selected
          return (
            <button
              key={item.value}
              ref={(node) => {
                if (node) tabRefs.current.set(item.value, node)
                else tabRefs.current.delete(item.value)
              }}
              type="button"
              role="tab"
              id={`tab-${item.value}`}
              aria-selected={isSelected}
              aria-controls={`tabpanel-${item.value}`}
              aria-label={item.srLabel}
              disabled={item.disabled}
              data-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => select(item.value)}
              className="t-tab"
            >
              {item.icon}
              {item.label}
              {item.count != null ? (
                <span className="tnum text-xs font-semibold text-muted-text">
                  {item.count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}