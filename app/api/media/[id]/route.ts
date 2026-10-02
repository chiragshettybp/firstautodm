import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin, handle, parseUserId } from "@/lib/ownership"
import { deleteMedia } from "@/lib/supabase-storage"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/**
 * Remove an upload.
 *
 * Ownership is enforced twice — the row is matched on (id, user_id) and the
 * object path is verified to sit inside the account's own folder — so a
 * guessed id cannot delete another account's file.
 */
export async function DELETE(request: NextRequest, context: Context) {
  return handle(async () => {
    const supabase = getSupabaseAdmin()
    const userId = parseUserId(request.nextUrl.searchParams.get("userId"))
    const { id } = await context.params

    await deleteMedia(supabase, userId, id)

    return NextResponse.json({ ok: true, id })
  })
}