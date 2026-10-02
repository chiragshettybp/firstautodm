import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin, handle, parseUserId, ApiError } from "@/lib/ownership"
import { buildOverview } from "@/lib/analytics"
import { parseRange } from "@/lib/validation"

export const dynamic = "force-dynamic"

/**
 * Feature 7 — overview figures for the analytics page.
 *
 * Everything here is derived from recorded `automation_events` and `messages`
 * rows. A brand new account legitimately has none, which the UI renders as an
 * empty state rather than zeroes pretending to be data.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const supabase = getSupabaseAdmin()
    const userId = parseUserId(request.nextUrl.searchParams.get("userId"))
    const { days, key } = parseRange(request.nextUrl.searchParams.get("range"))

    // Probe first so a missing table reports a migration hint instead of an
    // opaque 500.
    const { error: probe } = await supabase
      .from("automation_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)

    if (probe) {
      throw new ApiError(
        503,
        "Analytics are not ready yet. Run the latest schema.sql in the Supabase SQL editor to enable them.",
        "analytics_schema_missing",
      )
    }

    const overview = await buildOverview(supabase, userId, days)
    return NextResponse.json({ ...overview, range: key })
  })
}