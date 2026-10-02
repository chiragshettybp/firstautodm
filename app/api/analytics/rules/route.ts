import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin, handle, parseUserId } from "@/lib/ownership"
import { buildRulePerformance } from "@/lib/analytics"
import { parseRange } from "@/lib/validation"

export const dynamic = "force-dynamic"

/**
 * Feature 6 — per-rule performance: which rule fires, delivers and converts.
 *
 * Rules deleted during the window still appear (their `automation_id` is null
 * and the denormalised name is used) so history is never silently discarded.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const supabase = getSupabaseAdmin()
    const userId = parseUserId(request.nextUrl.searchParams.get("userId"))
    const { days } = parseRange(request.nextUrl.searchParams.get("range"))

    const { rows, truncated } = await buildRulePerformance(supabase, userId, days)
    return NextResponse.json({ rules: rows, truncated, windowDays: days })
  })
}