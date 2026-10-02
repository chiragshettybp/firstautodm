import { NextResponse, type NextRequest } from "next/server"

import { getSupabaseAdmin, handle, ApiError, parseUserId, type UserId } from "@/lib/ownership"
import { drainQueue } from "@/lib/dm-queue"
import { DEFAULT_LIMITS, SETTING_BOUNDS } from "@/lib/messaging-window"
import { settingsUpdateSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * Account settings — the only editable surface for the Feature 9 sending
 * limits, plus a read-only view of the connected account and the delivery
 * queue's health.
 *
 * Every path is account-scoped through `parseUserId` so a guessed id cannot
 * read or mutate another account, matching the ownership model used by the
 * other feature 6-12 routes.
 */

interface AccountRow {
  id: string | number
  username: string
  token_expires_at: string | null
  business_account_id: string | number | null
  page_id: string | null
  groq_auto_reply_enabled: boolean | null
  dm_daily_limit: number | null
  dm_min_spacing_secs: number | null
  dm_window_hours: number | null
}

const QUEUE_STATUSES = [
  "pending",
  "processing",
  "sent",
  "failed",
  "blocked_window",
  "rate_limited",
  "cancelled",
] as const

function toOptionalId(value: string | number | null): string | null {
  if (value === null || value === undefined || value === "") return null
  return String(value)
}

function describeToken(expiresAt: string | null): {
  status: "valid" | "expiring" | "expired" | "unknown"
  expiresAt: string | null
  daysRemaining: number | null
} {
  if (!expiresAt) return { status: "unknown", expiresAt: null, daysRemaining: null }

  const expiry = new Date(expiresAt).getTime()
  if (Number.isNaN(expiry)) return { status: "unknown", expiresAt, daysRemaining: null }

  const msRemaining = expiry - Date.now()
  const daysRemaining = Math.floor(msRemaining / 86_400_000)
  if (msRemaining <= 0) return { status: "expired", expiresAt, daysRemaining }
  if (daysRemaining <= 7) return { status: "expiring", expiresAt, daysRemaining }
  return { status: "valid", expiresAt, daysRemaining }
}

async function loadAccount(supabase: ReturnType<typeof getSupabaseAdmin>, userId: UserId) {
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, username, token_expires_at, business_account_id, page_id, groq_auto_reply_enabled, dm_daily_limit, dm_min_spacing_secs, dm_window_hours",
    )
    .eq("id", userId)
    .maybeSingle()

  if (error) throw new ApiError(500, "Could not load your account.", "account_lookup_failed")
  if (!data) throw new ApiError(404, "Account not found.", "account_not_found")
  return data as unknown as AccountRow
}

async function loadQueue(supabase: ReturnType<typeof getSupabaseAdmin>, userId: UserId) {
  const nowIso = new Date().toISOString()

  const [statusCounts, dueResult, nextResult, lastResult, problemsResult] = await Promise.all([
    Promise.all(
      QUEUE_STATUSES.map((status) =>
        supabase
          .from("dm_queue")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", userId)
          .eq("status", status),
      ),
    ),
    supabase
      .from("dm_queue")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .in("status", ["pending", "rate_limited"])
      .lte("send_at", nowIso),
    supabase
      .from("dm_queue")
      .select("send_at")
      .eq("owner_id", userId)
      .in("status", ["pending", "rate_limited"])
      .order("send_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("dm_queue")
      .select("created_at")
      .eq("owner_id", userId)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("dm_queue")
      .select("id, recipient_username, last_error, attempts, max_attempts, status, created_at")
      .eq("owner_id", userId)
      .in("status", ["failed", "blocked_window"])
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  const counts: Record<string, number> = {}
  QUEUE_STATUSES.forEach((status, index) => {
    counts[status] = statusCounts[index]?.count ?? 0
  })

  return {
    counts,
    dueNow: dueResult.count ?? 0,
    nextSendAt: (nextResult.data as { send_at?: string } | null)?.send_at ?? null,
    lastSentAt: (lastResult.data as { created_at?: string } | null)?.created_at ?? null,
    problems: (problemsResult.data ?? []) as unknown as Array<{
      id: string
      recipient_username: string | null
      last_error: string | null
      attempts: number
      max_attempts: number
      status: string
      created_at: string
    }>,
  }
}

/** Read the connected account, its limits and the queue's health. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const userId = parseUserId(request.nextUrl.searchParams.get("userId"))
    const supabase = getSupabaseAdmin()

    const [account, queue] = await Promise.all([
      loadAccount(supabase, userId),
      loadQueue(supabase, userId),
    ])

    const token = describeToken(account.token_expires_at)

    return NextResponse.json({
      account: {
        id: String(account.id),
        username: account.username,
        businessAccountId: toOptionalId(account.business_account_id),
        pageId: account.page_id,
        aiAutoReplyEnabled: account.groq_auto_reply_enabled === true,
        token: {
          status: token.status,
          expiresAt: token.expiresAt,
          daysRemaining: token.daysRemaining,
        },
      },
      limits: {
        dailyLimit: Number(account.dm_daily_limit ?? DEFAULT_LIMITS.dailyLimit),
        minSpacingSec: Number(account.dm_min_spacing_secs ?? DEFAULT_LIMITS.minSpacingSec),
        windowHours: Number(account.dm_window_hours ?? DEFAULT_LIMITS.windowHours),
      },
      bounds: SETTING_BOUNDS,
      defaults: DEFAULT_LIMITS,
      queue,
    })
  })
}

/** Save one or more sending limits. */
export async function PATCH(request: NextRequest) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const userId = parseUserId(body.userId)

    const parsed = settingsUpdateSchema.safeParse(body)
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Those settings are not valid.",
        "validation_error",
      )
    }

    const supabase = getSupabaseAdmin()
    await loadAccount(supabase, userId)

    const { data, error } = await supabase
      .from("users")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("dm_daily_limit, dm_min_spacing_secs, dm_window_hours")
      .single()

    if (error || !data) {
      throw new ApiError(500, "Could not save your settings.", "settings_update_failed")
    }

    const row = data as unknown as {
      dm_daily_limit: number
      dm_min_spacing_secs: number
      dm_window_hours: number
    }

    return NextResponse.json({
      limits: {
        dailyLimit: Number(row.dm_daily_limit),
        minSpacingSec: Number(row.dm_min_spacing_secs),
        windowHours: Number(row.dm_window_hours),
      },
    })
  })
}

/** Run the delivery queue for this account right now. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const userId = parseUserId(body.userId)

    if (body.action !== "drain") {
      throw new ApiError(400, "Unknown settings action.", "invalid_action")
    }

    const supabase = getSupabaseAdmin()
    await loadAccount(supabase, userId)

    const summary = await drainQueue(supabase, userId, { maxItems: 10, budgetMs: 20_000 })

    return NextResponse.json({ ok: true, summary })
  })
}
