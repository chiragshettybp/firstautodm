import type { SupabaseClient } from "./supabase-admin"

/**
 * Analytics for features 6 & 7.
 *
 * Every figure the dashboard shows is derived from `automation_events` (rule
 * and funnel behaviour) and `messages` (delivery and reply behaviour), which
 * are written by the webhook and the queue drain. Nothing here is synthesised:
 * if no events have been recorded the API returns empty collections and the UI
 * renders its empty state.
 *
 * Aggregation runs in JS rather than through Postgres aggregate functions so
 * the endpoint has no dependency on optional RPCs. `EVENT_SCAN_LIMIT` bounds
 * the work; when a range exceeds it the response is flagged `truncated` and the
 * UI says so rather than quietly showing partial numbers as if they were total.
 */

export const EVENT_SCAN_LIMIT = 50_000
const PAGE_SIZE = 1000

export type AnalyticsEventType =
  | "matched"
  | "queued"
  | "sent"
  | "failed"
  | "blocked_window"
  | "rate_limited"
  | "gated"
  | "step_entered"
  | "advanced"
  | "completed"
  | "abandoned"

export interface RecordEventInput {
  ownerId: string
  automationId?: string | null
  automationName?: string | null
  conversationId?: string | null
  funnelSessionId?: string | null
  recipientId?: string | null
  triggerSource: string
  triggerType: string
  eventType: AnalyticsEventType
  stepIndex?: number | null
  stepName?: string | null
  latencyMs?: number | null
  error?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Record one analytics event.
 *
 * Never throws: analytics must not be able to break message delivery. A failed
 * write is logged and the delivery continues.
 */
export async function recordEvent(
  supabase: SupabaseClient,
  input: RecordEventInput,
): Promise<void> {
  try {
    const { error } = await supabase.from("automation_events").insert({
      user_id: input.ownerId,
      automation_id: input.automationId ?? null,
      automation_name: input.automationName ?? null,
      conversation_id: input.conversationId ?? null,
      funnel_session_id: input.funnelSessionId ?? null,
      recipient_id: input.recipientId ?? null,
      trigger_source: input.triggerSource,
      trigger_type: input.triggerType,
      event_type: input.eventType,
      step_index: input.stepIndex ?? null,
      step_name: input.stepName ?? null,
      latency_ms: input.latencyMs ?? null,
      error: input.error ? String(input.error).slice(0, 500) : null,
      metadata: input.metadata ?? {},
    })
    if (error) console.warn("[analytics] recordEvent failed:", error.message)
  } catch (error) {
    console.warn("[analytics] recordEvent threw:", error)
  }
}

interface EventRow {
  created_at: string
  event_type: AnalyticsEventType
  trigger_source: string
  trigger_type: string
  automation_id: string | null
  automation_name: string | null
  recipient_id: string | null
  funnel_session_id: string | null
  step_index: number | null
  step_name: string | null
  latency_ms: number | null
}

/** Page through a range instead of pulling the whole table into memory. */
async function scan(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  userId: string,
  sinceIso: string,
  limit: number,
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
  const rows: Record<string, unknown>[] = []
  let truncated = false

  for (let from = 0; from < limit; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, limit) - 1
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .range(from, to)

    if (error) throw new Error(`Could not read ${table}: ${error.message}`)
    const batch = (data ?? []) as unknown as Record<string, unknown>[]
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    if (from + PAGE_SIZE >= limit) truncated = true
  }

  return { rows, truncated }
}

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

export interface OverviewResponse {
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

export async function buildOverview(
  supabase: SupabaseClient,
  userId: string,
  days: number,
): Promise<OverviewResponse> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const { rows: rawEvents, truncated: eventsTruncated } = await scan(
    supabase,
    "automation_events",
    "created_at,event_type,trigger_source,trigger_type,automation_id,recipient_id,funnel_session_id,step_index,step_name,latency_ms",
    userId,
    since,
    EVENT_SCAN_LIMIT,
  )
  const events = rawEvents as unknown as EventRow[]

  // ---- Messages: delivery volume and reply rate ----
  const { rows: rawMessages, truncated: messagesTruncated } = await scan(
    supabase,
    "messages",
    "conversation_id,is_from_instagram,created_at",
    userId,
    since,
    EVENT_SCAN_LIMIT,
  )
  const messages = rawMessages as unknown as {
    conversation_id: string
    is_from_instagram: boolean
    created_at: string
  }[]

  const dayMap = new Map<string, { sent: number; received: number }>()
  for (const m of messages) {
    const key = dayKey(m.created_at)
    const bucket = dayMap.get(key) ?? { sent: 0, received: 0 }
    if (m.is_from_instagram) bucket.received += 1
    else bucket.sent += 1
    dayMap.set(key, bucket)
  }

  // Reply rate = share of conversations that replied after our first outbound.
  const firstOutbound = new Map<string, number>()
  const repliedAfterOutbound = new Set<string>()
  for (const m of messages) {
    const t = Date.parse(m.created_at)
    if (m.is_from_instagram) {
      const sent = firstOutbound.get(m.conversation_id)
      if (sent !== undefined && t > sent) repliedAfterOutbound.add(m.conversation_id)
    } else {
      const sent = firstOutbound.get(m.conversation_id)
      if (sent === undefined || t < sent) firstOutbound.set(m.conversation_id, t)
    }
  }
  const conversationsWithOutbound = firstOutbound.size
  const replies = repliedAfterOutbound.size

  // ---- Event tallies ----
  const counts = {
    sent: 0,
    failed: 0,
    blockedWindow: 0,
    rateLimited: 0,
    matched: 0,
    gated: 0,
    completed: 0,
    abandoned: 0,
    advanced: 0,
  }
  const triggerCounts = new Map<string, number>()
  const firedRecipients = new Set<string>()
  const conversionRecipients = new Set<string>()

  for (const e of events) {
    switch (e.event_type) {
      case "sent":
        counts.sent += 1
        break
      case "failed":
        counts.failed += 1
        break
      case "blocked_window":
        counts.blockedWindow += 1
        break
      case "rate_limited":
        counts.rateLimited += 1
        break
      case "gated":
        counts.gated += 1
        break
      case "matched":
        counts.matched += 1
        break
      case "completed":
        counts.completed += 1
        if (e.recipient_id) conversionRecipients.add(e.recipient_id)
        break
      case "abandoned":
        counts.abandoned += 1
        break
      case "advanced":
        counts.advanced += 1
        break
      default:
        break
    }

    if (e.event_type === "matched" && e.recipient_id) firedRecipients.add(e.recipient_id)

    const label =
      e.trigger_type === "keyword" && e.trigger_source === "comment"
        ? "Comment keyword"
        : e.trigger_type === "reply_all"
          ? "Comment reply-all"
          : e.trigger_type === "postback"
            ? "Button / quick reply"
            : e.trigger_type === "mention"
              ? "Story mention"
              : e.trigger_type === "reaction"
                ? "Story reaction"
                : e.trigger_type === "reply"
                  ? "Story reply"
                  : e.trigger_type === "keyword"
                    ? "DM keyword"
                    : e.trigger_type
    triggerCounts.set(label, (triggerCounts.get(label) ?? 0) + 1)
  }

  const messagesPerDay = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const topTriggers = Array.from(triggerCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  return {
    range: `${days}d`,
    since,
    truncated: eventsTruncated || messagesTruncated,
    totals: {
      sent: counts.sent,
      failed: counts.failed,
      blockedWindow: counts.blockedWindow,
      rateLimited: counts.rateLimited,
      fired: counts.matched,
      conversations: conversationsWithOutbound,
      replies,
      replyRate: percent(replies, conversationsWithOutbound),
      conversions: counts.completed,
      conversionRate: percent(conversionRecipients.size, firedRecipients.size),
    },
    messagesPerDay,
    topTriggers,
    funnelActivity: {
      entered: firedRecipients.size,
      completed: conversionRecipients.size,
      abandoned: counts.abandoned,
    },
  }
}

export interface RulePerformanceRow {
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

export async function buildRulePerformance(
  supabase: SupabaseClient,
  userId: string,
  days: number,
): Promise<{ rows: RulePerformanceRow[]; truncated: boolean }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { rows: raw, truncated } = await scan(
    supabase,
    "automation_events",
    "created_at,event_type,trigger_source,trigger_type,automation_id,automation_name,recipient_id,latency_ms",
    userId,
    since,
    EVENT_SCAN_LIMIT,
  )
  const events = raw as unknown as EventRow[]

  interface Acc {
    name: string
    triggerSource: string
    triggerType: string
    fired: number
    sent: number
    failed: number
    blocked: number
    rateLimited: number
    gated: number
    recipients: Set<string>
    converted: Set<string>
    latencyTotal: number
    latencyCount: number
  }

  const map = new Map<string, Acc>()
  for (const e of events) {
    const key = e.automation_id ?? "deleted"
    let acc = map.get(key)
    if (!acc) {
      acc = {
        name: e.automation_name ?? (key === "deleted" ? "Deleted rule" : "Untitled rule"),
        triggerSource: e.trigger_source,
        triggerType: e.trigger_type,
        fired: 0,
        sent: 0,
        failed: 0,
        blocked: 0,
        rateLimited: 0,
        gated: 0,
        recipients: new Set(),
        converted: new Set(),
        latencyTotal: 0,
        latencyCount: 0,
      }
      map.set(key, acc)
    }

    if (e.event_type === "matched") {
      acc.fired += 1
      if (e.recipient_id) acc.recipients.add(e.recipient_id)
    } else if (e.event_type === "sent") {
      acc.sent += 1
      if (typeof e.latency_ms === "number") {
        acc.latencyTotal += e.latency_ms
        acc.latencyCount += 1
      }
    } else if (e.event_type === "failed") {
      acc.failed += 1
    } else if (e.event_type === "blocked_window") {
      acc.blocked += 1
    } else if (e.event_type === "rate_limited") {
      acc.rateLimited += 1
    } else if (e.event_type === "gated") {
      acc.gated += 1
    } else if (e.event_type === "completed") {
      if (e.recipient_id) acc.converted.add(e.recipient_id)
    }
  }

  const rows = Array.from(map.entries())
    .map(([automationId, acc]) => ({
      automationId: automationId === "deleted" ? null : automationId,
      name: acc.name,
      triggerSource: acc.triggerSource,
      triggerType: acc.triggerType,
      fired: acc.fired,
      sent: acc.sent,
      failed: acc.failed,
      blocked: acc.blocked,
      rateLimited: acc.rateLimited,
      gated: acc.gated,
      uniqueRecipients: acc.recipients.size,
      conversions: acc.converted.size,
      conversionRate: percent(acc.converted.size, acc.recipients.size),
      avgLatencyMs:
        acc.latencyCount > 0 ? Math.round(acc.latencyTotal / acc.latencyCount) : 0,
    }))
    .sort((a, b) => b.fired - a.fired)

  return { rows, truncated }
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

export async function buildFunnelBreakdown(
  supabase: SupabaseClient,
  userId: string,
  days: number,
): Promise<{ rows: FunnelBreakdown[]; truncated: boolean }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { rows: rawEvents, truncated } = await scan(
    supabase,
    "automation_events",
    "created_at,event_type,automation_id,automation_name,funnel_session_id,step_index,step_name,metadata",
    userId,
    since,
    EVENT_SCAN_LIMIT,
  )
  const events = rawEvents as unknown as (EventRow & {
    metadata?: Record<string, unknown> | null
  })[]

  interface Acc {
    name: string
    totalSteps: number
    completed: number
    activeSessions: Set<string>
    abandoned: number
    stepEntered: Map<number, { count: number; name: string; isConversion: boolean }>
    stepAdvanced: Map<number, number>
  }

  const map = new Map<string, Acc>()
  for (const e of events) {
    if (!e.automation_id) continue
    // Only events that belong to a funnel session carry step information.
    if (!e.funnel_session_id && e.event_type !== "completed") continue

    let acc = map.get(e.automation_id)
    if (!acc) {
      acc = {
        name: e.automation_name ?? "Untitled rule",
        totalSteps: 0,
        completed: 0,
        activeSessions: new Set(),
        abandoned: 0,
        stepEntered: new Map(),
        stepAdvanced: new Map(),
      }
      map.set(e.automation_id, acc)
    }

    if (e.event_type === "step_entered" && typeof e.step_index === "number") {
      const prev = acc.stepEntered.get(e.step_index)
      const isConversion = e.metadata?.is_conversion_step === true
      acc.stepEntered.set(e.step_index, {
        count: (prev?.count ?? 0) + 1,
        name: e.step_name ?? prev?.name ?? `Step ${e.step_index + 1}`,
        isConversion: isConversion || prev?.isConversion === true,
      })
    } else if (e.event_type === "advanced" && typeof e.step_index === "number") {
      acc.stepAdvanced.set(e.step_index, (acc.stepAdvanced.get(e.step_index) ?? 0) + 1)
    } else if (e.event_type === "completed") {
      acc.completed += 1
      acc.activeSessions.delete(e.funnel_session_id ?? "")
    } else if (e.event_type === "abandoned") {
      acc.abandoned += 1
      acc.activeSessions.delete(e.funnel_session_id ?? "")
    } else if (e.event_type === "sent" || e.event_type === "matched") {
      if (e.funnel_session_id) acc.activeSessions.add(e.funnel_session_id)
    }

    if (typeof e.step_index === "number") {
      acc.totalSteps = Math.max(acc.totalSteps, e.step_index + 1)
    }
  }

  const rows = Array.from(map.entries())
    .map(([automationId, acc]) => {
      const ordered = Array.from(acc.stepEntered.entries()).sort((a, b) => a[0] - b[0])
      const steps = ordered.map(([stepIndex, info], position) => {
        const previous = position > 0 ? ordered[position - 1][1].count : null
        const dropOffRate =
          previous && previous > 0 ? percent(Math.max(0, previous - info.count), previous) : 0
        return {
          stepIndex,
          stepName: info.name,
          entered: info.count,
          advanced: acc.stepAdvanced.get(stepIndex) ?? 0,
          reachedRate: ordered[0] ? percent(info.count, ordered[0][1].count) : 0,
          dropOffRate,
          isConversionStep: info.isConversion,
        }
      })
      const entered = ordered[0]?.[1].count ?? 0
      return {
        automationId,
        name: acc.name,
        totalSteps: acc.totalSteps,
        completed: acc.completed,
        active: acc.activeSessions.size,
        abandoned: acc.abandoned,
        conversionRate: percent(acc.completed, entered),
        steps,
      }
    })
    .filter((r) => r.steps.length > 0)
    .sort((a, b) => b.steps[0].entered - a.steps[0].entered)

  return { rows, truncated }
}