'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Client data hooks for features 6 & 7.
 *
 * All three endpoints are read-only and account-scoped, so they share one
 * `range` argument and one error surface. `code` is preserved so the UI can
 * tell a missing-schema 503 apart from a generic failure.
 */

export type AnalyticsRange = '7d' | '30d' | '90d'

export interface AnalyticsError {
  message: string
  code?: string
  status?: number
}

interface AsyncState<T> {
  data: T | null
  isLoading: boolean
  error: AnalyticsError | null
  refetch: () => void
}

function useResource<T>(url: string | null, extract: (json: any) => T): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<AnalyticsError | null>(null)
  const [nonce, setNonce] = useState(0)

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!url) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetch(url)
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok) {
          setError({
            message: json?.error ?? 'Could not load this report.',
            code: json?.code,
            status: res.status,
          })
          setData(null)
          return
        }
        setData(extract(json))
      })
      .catch(() => {
        if (!cancelled) {
          setError({ message: 'You appear to be offline. This report will retry when you reconnect.' })
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [url, nonce, extract])

  return { data, isLoading, error, refetch }
}

export interface AnalyticsOverview {
  range: string
  since: string
  truncated: boolean
  totals: {
    sent: number
    failed: number
    blockedWindow: number
    rateLimited: number
    fired: number
    conversations: number
    replies: number
    replyRate: number
    conversions: number
    conversionRate: number
  }
  messagesPerDay: { date: string; sent: number; received: number }[]
  topTriggers: { label: string; count: number }[]
  funnelActivity: { entered: number; completed: number; abandoned: number }
}

export interface RulePerformance {
  automationId: string | null
  name: string
  triggerSource: string
  triggerType: string
  fired: number
  sent: number
  failed: number
  blocked: number
  rateLimited: number
  gated: number
  uniqueRecipients: number
  conversions: number
  conversionRate: number
  avgLatencyMs: number
}

export interface FunnelBreakdown {
  automationId: string
  name: string
  totalSteps: number
  completed: number
  active: number
  abandoned: number
  conversionRate: number
  steps: {
    stepIndex: number
    stepName: string
    entered: number
    advanced: number
    reachedRate: number
    dropOffRate: number
    isConversionStep: boolean
  }[]
}

const overviewExtract = (json: any): AnalyticsOverview => json

export function useAnalyticsOverview(
  userId: string | null,
  range: AnalyticsRange,
): AsyncState<AnalyticsOverview> {
  const [extract] = useState(() => overviewExtract)
  const url = userId
    ? `/api/analytics/overview?userId=${encodeURIComponent(userId)}&range=${range}`
    : null
  return useResource(url, extract)
}

export function useRulePerformance(
  userId: string | null,
  range: AnalyticsRange,
): AsyncState<{ rules: RulePerformance[]; truncated: boolean; windowDays: number }> {
  const [extract] = useState(() => (json: any) => json)
  const url = userId
    ? `/api/analytics/rules?userId=${encodeURIComponent(userId)}&range=${range}`
    : null
  return useResource(url, extract)
}

export function useFunnelBreakdown(
  userId: string | null,
  range: AnalyticsRange,
): AsyncState<{ funnels: FunnelBreakdown[]; truncated: boolean; windowDays: number }> {
  const [extract] = useState(() => (json: any) => json)
  const url = userId
    ? `/api/analytics/funnels?userId=${encodeURIComponent(userId)}&range=${range}`
    : null
  return useResource(url, extract)
}
