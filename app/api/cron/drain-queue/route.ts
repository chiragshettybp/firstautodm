import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { drainAllAccounts } from "@/lib/dm-queue"
import { expireStaleSessions } from "@/lib/funnels"
import { handle } from "@/lib/ownership"

/**
 * Cron drain for the outbound queue and funnel sessions.
 *
 * The webhook performs an inline drain so a single reply is still immediate,
 * but anything it could not deliver within its time budget — paced messages,
 * retried failures, scheduled funnel steps — is picked up here.
 *
 * Scheduled every minute via `vercel.json`. Protected by CRON_SECRET: Vercel
 * sends it as `Authorization: Bearer <CRON_SECRET>`.
 */
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return NextResponse.json(
        { error: "CRON_SECRET is not configured, refusing to run the drain." },
        { status: 503 },
      )
    }

    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const [drained, expiredSessions] = await Promise.all([
      drainAllAccounts(supabase, { maxItems: 10, budgetMs: 45_000 }),
      expireStaleSessions(supabase),
    ])

    return NextResponse.json({
      ok: true,
      at: new Date().toISOString(),
      queue: drained,
      expiredSessions,
    })
  })
}