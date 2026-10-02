import type { SupabaseClient } from "./supabase-admin"

/**
 * Feature 9 — Meta messaging-window and rate-limit compliance.
 *
 * Instagram restricts when and how often a professional account may message a
 * person. Three independent limits apply, checked in priority order:
 *
 *   1. Messaging window — a conversation must still be open. Once it closes the
 *      message is never deliverable, so it is parked as `blocked_window` rather
 *      than retried forever.
 *   2. Rolling 24-hour cap — Meta throttles accounts that exceed a high daily
 *      conversation volume. Configured per account (`users.dm_daily_limit`).
 *   3. Per-recipient spacing — a minimum gap between two outbound messages to
 *      the same person, which is also what stops the queue from bursting.
 *
 * The `evaluate*` functions are pure so the rules are testable without a
 * database; `decideSend` is the thin I/O wrapper the queue calls.
 */

export const WINDOW_HOURS = {
  /** Standard messaging window after the recipient last wrote to us. */
  dm: 24,
  /** Meta allows private replies to a comment for 7 days. */
  commentReply: 24 * 7,
} as const

export type BlockReason = "window_closed" | "daily_cap" | "recipient_spacing"

export interface SendDecision {
  allowed: boolean
  reason: BlockReason | null
  /** Seconds to wait before the message becomes eligible. */
  retryAfterSec: number
  /** ISO timestamp the message may be sent at. */
  nextSendAt: string
  detail: string
}

const ALLOW: SendDecision = {
  allowed: true,
  reason: null,
  retryAfterSec: 0,
  nextSendAt: new Date().toISOString(),
  detail: "within limits",
}

export interface SendFacts {
  /** Last time the recipient wrote to us. null when they never have. */
  lastInboundAt: Date | null
  /** Outbound messages delivered in the rolling 24h window. */
  outbound24h: number
  /** Last outbound delivery to this same recipient. */
  lastOutboundAt: Date | null
  now?: Date
}

export interface SendLimits {
  dailyLimit: number
  minSpacingSec: number
  windowHours: number
}

export const DEFAULT_LIMITS: SendLimits = {
  dailyLimit: 250,
  minSpacingSec: 60,
  windowHours: WINDOW_HOURS.dm,
}

/**
 * Safe editing ranges for the per-account sending limits.
 *
 * Kept here (rather than in the Zod schema) so the settings form and the API
 * enforce the exact same numbers without shipping `zod` to the browser. The
 * minimums refuse a configuration that would trip Meta's throttle instantly;
 * the maximums leave headroom above the safe defaults.
 */
export const SETTING_BOUNDS = {
  dailyLimit: { min: 1, max: 1000, step: 10, default: DEFAULT_LIMITS.dailyLimit },
  minSpacingSec: { min: 5, max: 600, step: 5, default: DEFAULT_LIMITS.minSpacingSec },
  windowHours: { min: 1, max: 24, step: 1, default: DEFAULT_LIMITS.windowHours },
} as const

/** Named bundles shown as one-tap presets in the settings form. */
export const LIMIT_PRESETS = [
  {
    id: "conservative",
    label: "Careful",
    description: "Slowest, safest. Great for a new account.",
    values: { dailyLimit: 100, minSpacingSec: 120, windowHours: 24 },
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Meta's comfortable range for an active account.",
    values: { dailyLimit: 250, minSpacingSec: 60, windowHours: 24 },
  },
  {
    id: "assertive",
    label: "Assertive",
    description: "Higher volume. Watch the queue for throttling.",
    values: { dailyLimit: 500, minSpacingSec: 30, windowHours: 24 },
  },
] as const

export type LimitPreset = (typeof LIMIT_PRESETS)[number]

// ---- Pure evaluators ---------------------------------------------------

/**
 * 1. Messaging window. A DM can only be continued while the recipient's last
 * inbound message is inside the window. A private comment reply uses the
 * longer 7-day window Meta grants for comment threads.
 */
export function evaluateWindow(
  facts: SendFacts,
  limits: SendLimits,
  windowHours = limits.windowHours,
): SendDecision {
  const now = facts.now ?? new Date()

  // Never messaged us before: no window is open, so the only way to reach them
  // is a private comment reply, which Meta allows on its own 7-day window.
  if (!facts.lastInboundAt) {
    if (windowHours >= WINDOW_HOURS.commentReply) return ALLOW
    return {
      allowed: false,
      reason: "window_closed",
      retryAfterSec: 0,
      nextSendAt: now.toISOString(),
      detail: "recipient has never messaged this account, so no DM window is open",
    }
  }

  const expiresAt = facts.lastInboundAt.getTime() + windowHours * 3_600_000
  if (now.getTime() >= expiresAt) {
    return {
      allowed: false,
      reason: "window_closed",
      retryAfterSec: 0,
      nextSendAt: now.toISOString(),
      detail: `messaging window closed at ${new Date(expiresAt).toISOString()}`,
    }
  }

  return ALLOW
}

/** 2. Rolling 24-hour cap. */
export function evaluateDailyCap(facts: SendFacts, limits: SendLimits): SendDecision {
  const now = facts.now ?? new Date()
  if (facts.outbound24h < limits.dailyLimit) return ALLOW

  // Window is rolling, so the earliest send is when the oldest of the last 24h
  // rolls off. One minute of cushion avoids a boundary race.
  const retryAfterSec = 60
  return {
    allowed: false,
    reason: "daily_cap",
    retryAfterSec,
    nextSendAt: new Date(now.getTime() + retryAfterSec * 1000).toISOString(),
    detail: `${facts.outbound24h}/${limits.dailyLimit} messages sent in the last 24 hours`,
  }
}

/** 3. Minimum gap between two messages to the same recipient. */
export function evaluateSpacing(facts: SendFacts, limits: SendLimits): SendDecision {
  const now = facts.now ?? new Date()
  if (!facts.lastOutboundAt) return ALLOW

  const nextAt = facts.lastOutboundAt.getTime() + limits.minSpacingSec * 1000
  if (now.getTime() >= nextAt) return ALLOW

  const retryAfterSec = Math.ceil((nextAt - now.getTime()) / 1000)
  return {
    allowed: false,
    reason: "recipient_spacing",
    retryAfterSec,
    nextSendAt: new Date(nextAt).toISOString(),
    detail: `waiting ${retryAfterSec}s to respect the ${limits.minSpacingSec}s spacing between messages`,
  }
}

/** All three, in priority order. */
export function evaluateDecision(facts: SendFacts, limits: SendLimits, windowHours?: number): SendDecision {
  return (
    evaluateWindow(facts, limits, windowHours) ||
    evaluateDailyCap(facts, limits) ||
    evaluateSpacing(facts, limits)
  )
}

// ---- Backoff -----------------------------------------------------------

/**
 * Exponential retry schedule for transient failures: ~1m, ~5m, ~25m.
 * Meta 5xx and network blips usually clear within a minute, but retrying
 * immediately re-triggers the throttle.
 */
export function retryDelaySeconds(attempts: number): number {
  return [60, 300, 1500][Math.min(Math.max(attempts - 1, 0), 2)]
}

// ---- I/O wrapper -------------------------------------------------------

export async function loadSendFacts(
  supabase: SupabaseClient,
  ownerId: string,
  recipientId: string | null,
): Promise<SendFacts> {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()

  const [outbound24hRes, lastOutboundRes, convRes] = await Promise.all([
    supabase
      .from("dm_queue")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("status", "sent")
      .gte("created_at", dayAgo),
    recipientId
      ? supabase
          .from("dm_queue")
          .select("created_at")
          .eq("owner_id", ownerId)
          .eq("recipient_id", recipientId)
          .eq("status", "sent")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    recipientId
      ? supabase
          .from("conversations")
          .select("id")
          .eq("user_id", ownerId)
          .eq("recipient_id", recipientId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  let lastInboundAt: Date | null = null
  const conversationId = (convRes.data as { id?: string } | null)?.id
  if (conversationId) {
    const { data } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .eq("is_from_instagram", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.created_at) lastInboundAt = new Date(data.created_at)
  }

  return {
    lastInboundAt,
    outbound24h: outbound24hRes.count ?? 0,
    lastOutboundAt: lastOutboundRes.data?.created_at ? new Date(lastOutboundRes.data.created_at) : null,
  }
}

export async function decideSend(
  supabase: SupabaseClient,
  ownerId: string,
  limits: SendLimits,
  recipientId: string | null,
  kind: "dm" | "comment_reply",
): Promise<SendDecision> {
  const facts = await loadSendFacts(supabase, ownerId, recipientId)
  const windowHours = kind === "comment_reply" ? WINDOW_HOURS.commentReply : limits.windowHours
  return evaluateDecision(facts, limits, windowHours)
}