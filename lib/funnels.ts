import { z } from "zod"
import type { SupabaseClient } from "./supabase-admin"
import { recordEvent } from "./analytics"
import { enqueueMessage, PRIORITY } from "./dm-queue"
import { responseContentSchema, funnelStepSchema } from "./validation"
import type { ResponseContent } from "./types"

/**
 * Feature 10 — multistep funnels.
 *
 * Model: an automation's `response_content` is the ENTRY message (step 0) and
 * `follow_up_steps` holds steps 1..N. Keeping the entry message in the existing
 * field means a rule with no funnel behaves exactly as it did before this
 * feature existed — a funnel is simply a rule that also has follow-up steps.
 *
 * Scheduling: every follow-up step is enqueued immediately with a cumulative
 * delay, so the queue is the scheduler and delivery survives a cold start or a
 * crashed request. When the recipient replies in a way that matches the current
 * step's `advance_on`, the remaining steps are fast-forwarded so the person gets
 * an instant answer instead of waiting out the timer.
 *
 * Analytics: "step reached" is recorded by the drain when the step is actually
 * delivered, not when it is scheduled. A conversion is recorded when a step
 * flagged `is_conversion_step` is delivered.
 */

export type FunnelStep = z.infer<typeof funnelStepSchema>

/** Sessions idle for longer than this are abandoned. */
export const SESSION_IDLE_MINUTES = 24 * 60

/** Tolerantly read `follow_up_steps`, which may be a JSON string or null. */
export function parseFollowUpSteps(raw: unknown): FunnelStep[] {
  if (!raw) return []
  let value: unknown = raw
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []

  const steps: FunnelStep[] = []
  for (const candidate of value) {
    const parsed = responseContentSchema.safeParse(candidate?.content)
    if (!parsed.success) continue
    steps.push({
      id: String(candidate?.id ?? `step_${steps.length + 1}`),
      name: String(candidate?.name ?? `Step ${steps.length + 1}`),
      wait_minutes: Number(candidate?.wait_minutes ?? 0) || 0,
      content: parsed.data as ResponseContent,
      advance_on: {
        kind: candidate?.advance_on?.kind ?? "timeout",
        value: String(candidate?.advance_on?.value ?? ""),
      },
      is_conversion_step: candidate?.is_conversion_step === true,
    })
  }
  return steps
}

export function isFunnel(automation: { follow_up_steps?: unknown } | null): boolean {
  return parseFollowUpSteps(automation?.follow_up_steps).length > 0
}

function normalise(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

/**
 * Does this inbound message advance past the given step?
 *
 * `payload` covers quick replies and card postbacks, which arrive as
 * `event.message.quick_reply.payload` or `event.postback.payload`.
 */
export function matchesAdvance(
  step: FunnelStep,
  inbound: { text?: string | null; payload?: string | null },
): boolean {
  const trigger = step.advance_on
  if (trigger.kind === "timeout") return false

  const expected = normalise(trigger.value)
  if (!expected) return false

  if (trigger.kind === "payload") {
    const payload = normalise(inbound.payload)
    return !!payload && (payload === expected || payload.includes(expected))
  }

  const text = normalise(inbound.text ?? inbound.payload)
  if (!text) return false
  if (trigger.kind === "keyword") {
    return expected
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .some((k) => text.includes(k))
  }
  // quick_reply: the title the person tapped, or its payload
  return text === expected || text.includes(expected)
}

export interface FunnelSession {
  id: string
  user_id: string
  automation_id: string
  conversation_id: string | null
  recipient_id: string
  current_step: number
  total_steps: number
  status: string
}

/**
 * Find the session a recipient is currently inside, if any.
 *
 * `current_step` is the entry step (0) until a follow-up step is delivered, so
 * the "advance" check looks at the entry message's own trigger — which is the
 * follow-up step whose delivery is now due, if any.
 */
export async function findActiveSession(
  supabase: SupabaseClient,
  ownerId: string,
  recipientId: string,
): Promise<FunnelSession | null> {
  const { data } = await supabase
    .from("funnel_sessions")
    .select("*")
    .eq("user_id", ownerId)
    .eq("recipient_id", recipientId)
    .eq("status", "active")
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as FunnelSession | null) ?? null
}

export interface StartSessionInput {
  ownerId: string
  automationId: string
  automationName: string
  recipientId: string
  conversationId?: string | null
  recipientUsername?: string | null
  steps: FunnelStep[]
  triggerSource: string
  triggerType: string
  /** Already queued? skips rescheduling when a webhook delivery is retried. */
  dedupeSuffix?: string
}

/**
 * Open a funnel for a recipient and schedule every follow-up step.
 *
 * Re-triggering the same automation resumes the existing session instead of
 * starting a second one, so a person commenting twice does not receive the
 * whole sequence twice.
 */
export async function startSession(
  supabase: SupabaseClient,
  input: StartSessionInput,
): Promise<FunnelSession | null> {
  if (input.steps.length === 0) return null

  const existing = await findActiveSession(supabase, input.ownerId, input.recipientId)
  if (existing && existing.automation_id === input.automationId) {
    // Already inside this funnel. Just make sure the schedule is still intact.
    await scheduleRemainingSteps(supabase, input, existing)
    return existing
  }

  const totalSteps = 1 + input.steps.length
  const { data, error } = await supabase
    .from("funnel_sessions")
    .insert({
      user_id: input.ownerId,
      automation_id: input.automationId,
      conversation_id: input.conversationId ?? null,
      recipient_id: input.recipientId,
      current_step: 0,
      total_steps: totalSteps,
      status: "active",
    })
    .select("*")
    .single()

  if (error || !data) {
    console.warn("[funnel] could not start session:", error?.message)
    return null
  }

  const session = data as FunnelSession
  await scheduleRemainingSteps(supabase, input, session)
  return session
}

async function scheduleRemainingSteps(
  supabase: SupabaseClient,
  input: StartSessionInput,
  session: FunnelSession,
): Promise<void> {
  let cumulativeMinutes = 0

  for (let i = 0; i < input.steps.length; i += 1) {
    const step = input.steps[i]
    cumulativeMinutes += step.wait_minutes

    await enqueueMessage(supabase, {
      ownerId: input.ownerId,
      kind: "dm",
      content: step.content,
      recipientId: input.recipientId,
      recipientUsername: input.recipientUsername ?? null,
      conversationId: session.conversation_id,
      automationId: input.automationId,
      automationName: input.automationName,
      funnelSessionId: session.id,
      stepIndex: i + 1,
      stepName: step.name,
      isConversionStep: step.is_conversion_step,
      triggerSource: input.triggerSource,
      triggerType: input.triggerType,
      priority: PRIORITY.funnelStep,
      delaySeconds: cumulativeMinutes * 60,
      // Scoped to the session so rescheduling is idempotent.
      dedupeKey: `funnel:${session.id}:${i + 1}`,
    })
  }
}

/**
 * Pull every still-pending step of a session forward to now.
 *
 * This is what turns a reply into an instant reply rather than a wait.
 */
export async function accelerateSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  await supabase
    .from("dm_queue")
    .update({ send_at: new Date().toISOString(), status: "pending" })
    .eq("funnel_session_id", sessionId)
    .in("status", ["pending", "rate_limited"])
    .gt("send_at", new Date().toISOString())
}

/**
 * React to an inbound message: advance the session if it matches the step the
 * person is currently sitting on, and log the `advanced` event.
 */
export async function handleInboundAdvance(
  supabase: SupabaseClient,
  args: {
    ownerId: string
    recipientId: string
    steps: FunnelStep[]
    automationName: string
    triggerSource: string
    triggerType: string
    inbound: { text?: string | null; payload?: string | null }
  },
): Promise<FunnelSession | null> {
  const session = await findActiveSession(supabase, args.ownerId, args.recipientId)
  if (!session) return null

  // current_step 0 = the entry message; the next step to be delivered is 1.
  const pendingStepIndex = session.current_step + 1
  const nextStep = args.steps[pendingStepIndex - 1]
  if (!nextStep) return session

  if (!matchesAdvance(nextStep, args.inbound)) return session

  await supabase
    .from("funnel_sessions")
    .update({
      current_step: pendingStepIndex,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", session.id)

  await recordEvent(supabase, {
    ownerId: args.ownerId,
    automationId: session.automation_id,
    automationName: args.automationName,
    conversationId: session.conversation_id,
    funnelSessionId: session.id,
    recipientId: args.recipientId,
    triggerSource: args.triggerSource,
    triggerType: args.triggerType,
    eventType: "advanced",
    stepIndex: pendingStepIndex - 1,
    stepName: nextStep.name,
    metadata: { trigger: nextStep.advance_on.kind, value: nextStep.advance_on.value },
  })

  // Deliver everything that is still waiting right away.
  await accelerateSession(supabase, session.id)

  return { ...session, current_step: pendingStepIndex }
}

/**
 * Retire sessions that have gone quiet, recording the drop-off so the funnel
 * analytics show where people leave. Run from the cron route.
 */
export async function expireStaleSessions(
  supabase: SupabaseClient,
  ownerId?: string,
): Promise<number> {
  const cutoff = new Date(Date.now() - SESSION_IDLE_MINUTES * 60_000).toISOString()

  let query = supabase
    .from("funnel_sessions")
    .select("id,user_id,automation_id,conversation_id,recipient_id,current_step")
    .eq("status", "active")
    .lt("last_activity_at", cutoff)
  if (ownerId) query = query.eq("user_id", ownerId)

  const { data } = await query.limit(1000)
  const stale = (data ?? []) as unknown as (FunnelSession & { user_id: string })[]
  let expired = 0

  for (const session of stale) {
    const { data: updated } = await supabase
      .from("funnel_sessions")
      .update({ status: "abandoned" })
      .eq("id", session.id)
      .eq("status", "active")
      .select("id")
      .maybeSingle()
    if (!updated) continue

    // Stop any step that has not gone out yet — sending into an abandoned
    // funnel is exactly the spam the funnel was meant to avoid.
    await supabase
      .from("dm_queue")
      .update({ status: "cancelled" })
      .eq("funnel_session_id", session.id)
      .in("status", ["pending", "rate_limited"])

    await recordEvent(supabase, {
      ownerId: session.user_id,
      automationId: session.automation_id,
      conversationId: session.conversation_id,
      funnelSessionId: session.id,
      recipientId: session.recipient_id,
      triggerSource: "system",
      triggerType: "session_expiry",
      eventType: "abandoned",
      stepIndex: session.current_step,
    })
    expired += 1
  }

  return expired
}