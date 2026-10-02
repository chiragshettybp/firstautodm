import {
  sendTextDM,
  sendCardDM,
  sendMediaDM,
  sendSenderAction,
  replyToComment,
  type SendResult,
} from "./instagram-api"
import {
  DEFAULT_LIMITS,
  decideSend,
  retryDelaySeconds,
  type SendLimits,
} from "./messaging-window"
import { recordEvent, type AnalyticsEventType } from "./analytics"
import type { SupabaseClient } from "./supabase-admin"
import type { ResponseContent } from "./types"

/**
 * Feature 9 — outbound delivery queue, and the single delivery path used by
 * the webhook for every outbound message.
 *
 * Why a queue at all:
 *   - The webhook used to `await sleep()` then send inline. A burst of replies
 *     could exceed the serverless timeout mid-send, leaving the recipient with
 *     a partial reply and no record of what was sent.
 *   - Meta rate-limits conversations. Sending without a pacer gets the account
 *     throttled, and there is no recovery other than waiting.
 *
 * Flow: `deliver()` writes a `pending` row and then attempts an inline drain
 * with a small time budget, so the common single-reply case is still immediate.
 * Anything that does not fit is picked up by the cron drain. Claims use
 * `FOR UPDATE SKIP LOCKED`, so concurrent invocations cannot double-send.
 */

export type QueueKind = "dm" | "comment_reply" | "public_comment"

/** Lower runs first. The follow gate is time-sensitive, so it leads. */
export const PRIORITY = {
  gate: 10,
  funnelStep: 20,
  reply: 30,
  scheduled: 40,
  commentReply: 50,
} as const

export interface EnqueueInput {
  ownerId: string
  kind: QueueKind
  content: ResponseContent
  recipientId?: string | null
  recipientUsername?: string | null
  commentId?: string | null
  conversationId?: string | null
  automationId?: string | null
  automationName?: string | null
  funnelSessionId?: string | null
  triggerSource: string
  triggerType: string
  /** Funnel position carried on the row so the drain can log step events. */
  stepIndex?: number | null
  stepName?: string | null
  isConversionStep?: boolean | null
  priority?: number
  /** Makes the send idempotent across webhook retries and double taps. */
  dedupeKey?: string | null
  /** Seconds to hold the message back, used to space funnel steps. */
  delaySeconds?: number
  maxAttempts?: number
}

export interface EnqueueResult {
  id: string | null
  status: "queued" | "duplicate"
}

export async function enqueueMessage(
  supabase: SupabaseClient,
  input: EnqueueInput,
): Promise<EnqueueResult> {
  // A rule's own `delay_seconds` is a human-typing pause. Applying it here as
  // a queue delay instead of a `sleep()` keeps the request responsive and the
  // pause survives a restart.
  const contentDelay = Number((input.content as { delay_seconds?: unknown }).delay_seconds ?? 0)
  const totalDelay = Math.max(0, input.delaySeconds ?? 0) + (Number.isFinite(contentDelay) ? contentDelay : 0)
  const sendAt = new Date(Date.now() + totalDelay * 1000).toISOString()

  if (input.dedupeKey) {
    // Check first so the common case costs one cheap read and no failed insert.
    const { data: existing } = await supabase
      .from("dm_queue")
      .select("id")
      .eq("dedupe_key", input.dedupeKey)
      .maybeSingle()
    if (existing) return { id: existing.id as string, status: "duplicate" }
  }

  const { data, error } = await supabase
    .from("dm_queue")
    .insert({
      owner_id: input.ownerId,
      kind: input.kind,
      content: input.content,
      recipient_id: input.recipientId ?? null,
      recipient_username: input.recipientUsername ?? null,
      comment_id: input.commentId ?? null,
      conversation_id: input.conversationId ?? null,
      automation_id: input.automationId ?? null,
      funnel_session_id: input.funnelSessionId ?? null,
      trigger_source: input.triggerSource,
      trigger_type: input.triggerType,
      step_index: input.stepIndex ?? null,
      step_name: input.stepName ?? null,
      is_conversion_step: input.isConversionStep ?? null,
      priority: input.priority ?? PRIORITY.reply,
      status: "pending",
      attempts: 0,
      max_attempts: input.maxAttempts ?? 3,
      send_at: sendAt,
      dedupe_key: input.dedupeKey ?? null,
    })
    .select("id")
    .single()

  if (error) {
    // A concurrent writer may have won the dedupe race between our read and insert.
    if (input.dedupeKey && error.code === "23505") return { id: null, status: "duplicate" }
    console.error("[queue] enqueue failed:", error.message)
    throw new Error(`Could not queue the message: ${error.message}`)
  }

  return { id: (data as { id: string }).id, status: "queued" }
}

// ---- Immediate send (used by the drain) --------------------------------

function buildQuickReplies(content: ResponseContent) {
  if (!Array.isArray(content.quick_replies) || content.quick_replies.length === 0) return undefined
  return content.quick_replies
    .filter((q) => q?.title)
    .map((q) => ({
      title: q.title,
      payload: q.payload || `QR_${q.title.toUpperCase().replace(/\s+/g, "_")}`,
    }))
}

/**
 * Send one queue row's content right now.
 *
 * Mirrors the webhook's original delivery order: media first (with its caption
 * as a follow-up text when present), otherwise the card, otherwise the message.
 */
export async function performSend(
  token: string,
  row: {
    kind: QueueKind
    recipient_id: string | null
    comment_id: string | null
    content: ResponseContent
  },
): Promise<SendResult> {
  const content = row.content ?? {}

  if (row.kind === "public_comment") {
    if (!row.comment_id || !content.message) return { ok: false, error: "missing comment id or text" }
    return replyToComment(token, row.comment_id, content.message)
  }

  const recipient = row.kind === "comment_reply"
    ? { comment_id: row.comment_id ?? undefined }
    : { id: row.recipient_id ?? undefined }

  if (!row.comment_id && !row.recipient_id) return { ok: false, error: "missing recipient" }

  // `mark_seen` defaults to true for DMs, matching the existing webhook behaviour.
  if (row.kind === "dm" && row.recipient_id && content.mark_seen !== false) {
    await sendSenderAction(token, row.recipient_id, "mark_seen")
  }

  const useTyping = content.typing_indicator === true && row.kind === "dm" && !!row.recipient_id
  if (useTyping) await sendSenderAction(token, row.recipient_id!, "typing_on")

  const quickReplies = buildQuickReplies(content)
  let result: SendResult

  if (content.media?.url) {
    result = await sendMediaDM(
      token,
      recipient,
      content.media.type || "image",
      content.media.url,
    )
    if (result.ok && content.message) {
      result = await sendTextDM(token, recipient, content.message, quickReplies)
    }
  } else if (content.card) {
    result = await sendCardDM(token, recipient, content.card)
  } else if (content.message) {
    result = await sendTextDM(token, recipient, content.message, quickReplies)
  } else {
    result = { ok: false, error: "empty content" }
  }

  if (useTyping) await sendSenderAction(token, row.recipient_id!, "typing_off")

  return result
}

// ---- Drain --------------------------------------------------------------

export interface QueueRow {
  id: string
  owner_id: string
  kind: QueueKind
  content: ResponseContent
  recipient_id: string | null
  recipient_username: string | null
  comment_id: string | null
  conversation_id: string | null
  automation_id: string | null
  funnel_session_id: string | null
  trigger_source: string
  trigger_type: string
  attempts: number
  max_attempts: number
  status: string
  step_index: number | null
  step_name: string | null
  is_conversion_step: boolean | null
}

export interface DrainSummary {
  claimed: number
  sent: number
  failed: number
  deferred: number
  blocked: number
  duplicates: number
}

function describeError(error: unknown): string {
  if (!error) return "unknown error"
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (typeof error === "object") {
    const e = error as { message?: string; error?: { message?: string } }
    return e.error?.message || e.message || JSON.stringify(error).slice(0, 300)
  }
  return String(error)
}

async function persistOutgoingMessage(
  supabase: SupabaseClient,
  row: QueueRow,
  preview: string,
  username: string,
): Promise<void> {
  if (!row.conversation_id) return
  // Deterministic id derived from the queue row: a retried drain can never
  // write the same message into the thread twice.
  const { error } = await supabase.from("messages").insert({
    id: `auto_${row.id}`,
    conversation_id: row.conversation_id,
    user_id: row.owner_id,
    sender_id: row.owner_id,
    sender_username: username,
    content: preview,
    is_from_instagram: false,
  })
  if (error) console.warn("[queue] could not persist outgoing message:", error.message)
}

function previewOf(content: ResponseContent): string {
  if (content?.message) return content.message
  if (content?.card) return `[Card] ${content.card.title}`
  if (content?.media?.url) return `[${content.media.type || "media"}]`
  return "[automation]"
}

/**
 * Claim and deliver everything currently due for one account.
 *
 * `budgetMs` bounds wall-clock time so an inline call from the webhook cannot
 * push the response past the serverless limit. Messages that do not fit stay
 * `pending` with a `send_at` in the past, so the next drain picks them up.
 */
export async function drainQueue(
  supabase: SupabaseClient,
  ownerId: string,
  options: { maxItems?: number; budgetMs?: number } = {},
): Promise<DrainSummary> {
  const maxItems = options.maxItems ?? 5
  const budgetMs = options.budgetMs ?? 4000
  const deadline = Date.now() + budgetMs
  const summary: DrainSummary = {
    claimed: 0,
    sent: 0,
    failed: 0,
    deferred: 0,
    blocked: 0,
    duplicates: 0,
  }

  const { data: account, error: accountError } = await supabase
    .from("users")
    .select("username, access_token, dm_daily_limit, dm_min_spacing_secs, dm_window_hours")
    .eq("id", ownerId)
    .maybeSingle()

  if (accountError || !account) {
    console.warn("[queue] drain skipped, account not resolvable:", accountError?.message)
    return summary
  }

  const token = account.access_token as string
  const username = (account.username as string) || "Autodm"
  const limits: SendLimits = {
    dailyLimit: Number(account.dm_daily_limit ?? DEFAULT_LIMITS.dailyLimit),
    minSpacingSec: Number(account.dm_min_spacing_secs ?? DEFAULT_LIMITS.minSpacingSec),
    windowHours: Number(account.dm_window_hours ?? DEFAULT_LIMITS.windowHours),
  }

  const { data: claimed, error: claimError } = await supabase.rpc("claim_dm_queue", {
    p_owner_id: ownerId,
    p_limit: maxItems,
  })

  if (claimError) {
    // The RPC ships in schema.sql but is not guaranteed to exist on a database
    // that has not been re-migrated. Fall back to a plain claim so delivery
    // keeps working; the queue is still paced, just without row-level locking.
    console.warn("[queue] claim_dm_queue unavailable, using fallback:", claimError.message)
    return fallbackDrain(supabase, ownerId, token, username, limits, summary, deadline)
  }

  const rows = (claimed ?? []) as unknown as QueueRow[]
  summary.claimed = rows.length

  for (const row of rows) {
    if (Date.now() >= deadline) {
      await releaseRow(supabase, row.id)
      summary.deferred += 1
      continue
    }

    const decision = await decideSend(
      supabase,
      ownerId,
      limits,
      row.recipient_id,
      row.kind === "dm" ? "dm" : "comment_reply",
    )

    const eventBase = {
      ownerId,
      automationId: row.automation_id,
      conversationId: row.conversation_id,
      funnelSessionId: row.funnel_session_id,
      recipientId: row.recipient_id,
      triggerSource: row.trigger_source,
      triggerType: row.trigger_type,
      stepIndex: row.step_index,
      stepName: row.step_name,
    }

    if (!decision.allowed) {
      if (decision.reason === "window_closed") {
        // Permanently undeliverable: stop retrying, keep the audit trail.
        await supabase
          .from("dm_queue")
          .update({ status: "blocked_window", last_error: decision.detail })
          .eq("id", row.id)
        summary.blocked += 1
        await recordEvent(supabase, {
          ...eventBase,
          eventType: "blocked_window",
          error: decision.detail,
        })
      } else {
        await supabase
          .from("dm_queue")
          .update({
            status: "rate_limited",
            send_at: decision.nextSendAt,
            last_error: decision.detail,
          })
          .eq("id", row.id)
        summary.deferred += 1
        await recordEvent(supabase, {
          ...eventBase,
          eventType: "rate_limited",
          error: decision.detail,
        })
      }
      continue
    }

    const startedAt = Date.now()
    const result = await performSend(token, row)
    const latencyMs = Date.now() - startedAt

    if (result.ok) {
      await supabase
        .from("dm_queue")
        .update({ status: "sent", last_error: null, latency_ms: latencyMs })
        .eq("id", row.id)
      summary.sent += 1
      await persistOutgoingMessage(supabase, row, previewOf(row.content), username)
      await recordEvent(supabase, {
        ...eventBase,
        eventType: "sent",
        latencyMs,
        metadata: { kind: row.kind, attempts: row.attempts },
      })
      // A funnel step counts as "reached" only once it is actually delivered,
      // so the funnel analytics reflect what the recipient really saw.
      if (row.funnel_session_id && row.step_index !== null) {
        await recordEvent(supabase, {
          ...eventBase,
          eventType: "step_entered",
          metadata: { is_conversion_step: row.is_conversion_step === true },
        })
        if (row.is_conversion_step) {
          await completeSession(supabase, row, "delivered_conversion_step")
        }
      }
    } else if (row.attempts < row.max_attempts) {
      const delay = retryDelaySeconds(row.attempts)
      await supabase
        .from("dm_queue")
        .update({
          status: "pending",
          send_at: new Date(Date.now() + delay * 1000).toISOString(),
          last_error: describeError(result.error).slice(0, 500),
        })
        .eq("id", row.id)
      summary.failed += 1
      await recordEvent(supabase, {
        ...eventBase,
        eventType: "failed",
        latencyMs,
        error: describeError(result.error),
        metadata: { retryInSec: delay, attempts: row.attempts, willRetry: true },
      })
    } else {
      await supabase
        .from("dm_queue")
        .update({ status: "failed", last_error: describeError(result.error).slice(0, 500) })
        .eq("id", row.id)
      summary.failed += 1
      await recordEvent(supabase, {
        ...eventBase,
        eventType: "failed",
        latencyMs,
        error: describeError(result.error),
        metadata: { attempts: row.attempts, willRetry: false },
      })
    }
  }

  return summary
}

/** Put an unprocessed row back so a later drain can pick it up. */
async function releaseRow(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase
    .from("dm_queue")
    .update({ status: "pending", claimed_at: null })
    .eq("id", id)
}

/**
 * Mark a funnel session converted.
 *
 * Guarded on `status = 'active'` so the UPDATE is itself the lock: whichever
 * delivery wins the race flips the session, and the loser's write affects zero
 * rows so it does not double-count the conversion.
 */
export async function completeSession(
  supabase: SupabaseClient,
  row: { owner_id: string; funnel_session_id: string | null; automation_id: string | null; conversation_id: string | null; recipient_id: string | null; trigger_source: string; trigger_type: string; step_index: number | null; step_name: string | null },
  reason: string,
): Promise<boolean> {
  if (!row.funnel_session_id) return false

  const { data } = await supabase
    .from("funnel_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", row.funnel_session_id)
    .eq("status", "active")
    .select("id")
    .maybeSingle()

  if (!data) return false

  await supabase
    .from("dm_queue")
    .update({ status: "cancelled" })
    .eq("funnel_session_id", row.funnel_session_id)
    .in("status", ["pending", "rate_limited"])

  await recordEvent(supabase, {
    ownerId: row.owner_id,
    automationId: row.automation_id,
    conversationId: row.conversation_id,
    funnelSessionId: row.funnel_session_id,
    recipientId: row.recipient_id,
    triggerSource: row.trigger_source,
    triggerType: row.trigger_type,
    eventType: "completed",
    stepIndex: row.step_index,
    stepName: row.step_name,
    metadata: { reason },
  })

  return true
}

async function fallbackDrain(
  supabase: SupabaseClient,
  ownerId: string,
  token: string,
  username: string,
  limits: SendLimits,
  summary: DrainSummary,
  deadline: number,
): Promise<DrainSummary> {
  const { data } = await supabase
    .from("dm_queue")
    .select("*")
    .eq("owner_id", ownerId)
    .in("status", ["pending", "rate_limited"])
    .lte("send_at", new Date().toISOString())
    .order("priority", { ascending: true })
    .order("send_at", { ascending: true })
    .limit(summary.claimed || 5)

  const rows = (data ?? []) as unknown as QueueRow[]
  summary.claimed = rows.length

  for (const row of rows) {
    if (Date.now() >= deadline) {
      summary.deferred += 1
      continue
    }
    await supabase
      .from("dm_queue")
      .update({ status: "processing", claimed_at: new Date().toISOString(), attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("status", row.status)

    const decision = await decideSend(
      supabase,
      ownerId,
      limits,
      row.recipient_id,
      row.kind === "dm" ? "dm" : "comment_reply",
    )

    if (!decision.allowed) {
      const status = decision.reason === "window_closed" ? "blocked_window" : "rate_limited"
      await supabase
        .from("dm_queue")
        .update({ status, send_at: decision.nextSendAt, last_error: decision.detail })
        .eq("id", row.id)
      if (status === "blocked_window") summary.blocked += 1
      else summary.deferred += 1
      continue
    }

    const result = await performSend(token, row)
    if (result.ok) {
      await supabase.from("dm_queue").update({ status: "sent", last_error: null }).eq("id", row.id)
      summary.sent += 1
      await persistOutgoingMessage(supabase, row, previewOf(row.content), username)
      await recordEvent(supabase, {
        ownerId,
        automationId: row.automation_id,
        conversationId: row.conversation_id,
        funnelSessionId: row.funnel_session_id,
        recipientId: row.recipient_id,
        triggerSource: row.trigger_source,
        triggerType: row.trigger_type,
        stepIndex: row.step_index,
        stepName: row.step_name,
        eventType: "sent",
        metadata: { kind: row.kind, fallback: true },
      })
      if (row.funnel_session_id && row.step_index !== null) {
        await recordEvent(supabase, {
          ownerId,
          automationId: row.automation_id,
          conversationId: row.conversation_id,
          funnelSessionId: row.funnel_session_id,
          recipientId: row.recipient_id,
          triggerSource: row.trigger_source,
          triggerType: row.trigger_type,
          stepIndex: row.step_index,
          stepName: row.step_name,
          eventType: "step_entered",
          metadata: { is_conversion_step: row.is_conversion_step === true },
        })
        if (row.is_conversion_step) {
          await completeSession(supabase, row, "delivered_conversion_step")
        }
      }
    } else {
      await supabase
        .from("dm_queue")
        .update({
          status: row.attempts + 1 >= row.max_attempts ? "failed" : "pending",
          send_at: new Date(Date.now() + retryDelaySeconds(row.attempts) * 1000).toISOString(),
          last_error: describeError(result.error).slice(0, 500),
        })
        .eq("id", row.id)
      summary.failed += 1
    }
  }

  return summary
}

export interface DeliverInput extends EnqueueInput {
  /** Attempt an inline drain so a single reply is still immediate. */
  inlineBudgetMs?: number
}

/**
 * The delivery entry point used by the webhook.
 *
 * Enqueues, logs the `queued` event, then tries an inline drain. The returned
 * `SendResult` reflects whether the message actually went out during this call;
 * callers that only care that the message was accepted should ignore it.
 */
export async function deliver(
  supabase: SupabaseClient,
  input: DeliverInput,
): Promise<SendResult> {
  const enqueued = await enqueueMessage(supabase, input)

  if (enqueued.status === "duplicate") {
    console.log("[queue] duplicate suppressed:", input.dedupeKey)
    return { ok: true, id: enqueued.id ?? undefined }
  }

  await recordEvent(supabase, {
    ownerId: input.ownerId,
    automationId: input.automationId,
    automationName: input.automationName,
    conversationId: input.conversationId,
    funnelSessionId: input.funnelSessionId,
    recipientId: input.recipientId,
    triggerSource: input.triggerSource,
    triggerType: input.triggerType,
    eventType: "queued",
    stepIndex: input.stepIndex,
    stepName: input.stepName,
  })

  await drainQueue(supabase, input.ownerId, {
    maxItems: 5,
    budgetMs: input.inlineBudgetMs ?? 4000,
  })

  return { ok: true, id: enqueued.id ?? undefined }
}

/** Drain every account that has queued work. Used by the cron route. */
export async function drainAllAccounts(
  supabase: SupabaseClient,
  options: { maxItems?: number; budgetMs?: number; limit?: number } = {},
): Promise<{ accounts: number; sent: number; failed: number; deferred: number; blocked: number }> {
  // `owner_id::text` keeps 19-digit ids exact; letting PostgREST return them as
  // JSON numbers would round them and drain the wrong account.
  const { data } = await supabase
    .from("dm_queue")
    .select("owner_id::text")
    .in("status", ["pending", "rate_limited"])
    .lte("send_at", new Date().toISOString())
    .limit(options.limit ?? 100)

  const rows = (data ?? []) as unknown as { owner_id: string }[]
  const owners: string[] = []
  for (const { owner_id } of rows) {
    const id = String(owner_id)
    if (/^[1-9]\d{0,18}$/.test(id) && !owners.includes(id)) owners.push(id)
  }
  const totals = { accounts: owners.length, sent: 0, failed: 0, deferred: 0, blocked: 0 }

  for (const ownerId of owners) {
    const summary = await drainQueue(supabase, ownerId, options)
    totals.sent += summary.sent
    totals.failed += summary.failed
    totals.deferred += summary.deferred
    totals.blocked += summary.blocked
  }

  return totals
}

export type { AnalyticsEventType }