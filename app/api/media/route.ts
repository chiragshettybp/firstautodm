import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin, handle, parseUserId } from "@/lib/ownership"

export const dynamic = "force-dynamic"

/** List the account's uploaded media, newest first. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const supabase = getSupabaseAdmin()
    const userId = parseUserId(request.nextUrl.searchParams.get("userId"))

    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 50, 200)

    const { data, error } = await supabase
      .from("uploaded_media")
      .select("id, public_url, mime_type, kind, size_bytes, original_name, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json(
        { error: "Could not load your media library.", code: "media_list_failed" },
        { status: 500 },
      )
    }

    return NextResponse.json({ media: data ?? [] })
  })
}