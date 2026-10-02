import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin, handle, parseUserId } from "@/lib/ownership"
import { buildFunnelBreakdown } from "@/lib/analytics"
import { parseRange } from "@/lib/validation"

export const dynamic = "force-dynamic"

/**
 * Feature 6 — funnel analytics: how many people reached each step and where
 * they dropped off.
 *
 * "Reached" counts delivered steps only, so a step that was scheduled but
 * blocked by the messaging window or a rate limit is not counted as reached.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const supabase = getSupabaseAdmin()
    const userId = parseUserId(request.nextUrl.searchParams.get("userId"))
    const { days } = parseRange(request.nextUrl.searchParams.get("range"))

    const { rows, truncated } = await buildFunnelBreakdown(supabase, userId, days)
    return NextResponse.json({ funnels: rows, truncated, windowDays: days })
  })
}