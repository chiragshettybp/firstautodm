'use client'

import { useEffect, useRef } from 'react'

/**
 * Feature 9 — live refresh without a realtime dependency.
 *
 * This app has no Supabase Auth session (see lib/ownership.ts), so a browser
 * realtime subscription would authenticate as `anon` and be filtered out by RLS;
 * it would look like it worked while never delivering an event. Instead this
 * polls the same account-scoped endpoints that already enforce ownership, and
 * only while the tab is visible so a background tab cannot burn requests.
 *
 * The check is interval-based, not `setInterval` alone: a suspended tab that
 * resumes refetches immediately rather than waiting for the next tick.
 */

export interface LiveRefreshOptions {
  /** Poll cadence in ms. Defaults to 15s. */
  intervalMs?: number
  /** Turn polling off (e.g. while no account id is known). Defaults to true. */
  enabled?: boolean
}

export function useLiveRefresh(
  refetch: () => void,
  { intervalMs = 15_000, enabled = true }: LiveRefreshOptions = {},
) {
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    let timer: ReturnType<typeof setInterval> | null = null

    const tick = () => {
      if (document.visibilityState === 'visible') refetchRef.current()
    }

    const start = () => {
      if (timer !== null) return
      timer = setInterval(tick, intervalMs)
    }
    const stop = () => {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refetchRef.current()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', tick)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', tick)
    }
  }, [intervalMs, enabled])
}
