import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { ApiError, findOwned, handle, parseUserId, requireOwner } from "@/lib/ownership"
import { automationUpsertSchema, fieldErrors, followUpStepsSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

/**
 * Automation CRUD for features 8, 10 and 12.
 *
 * Changes from the previous implementation:
 *   - every payload is validated against the real `response_content` contract
 *     (feature 12), so a rule that Instagram would reject cannot be saved
 *   - `follow_up_steps` is validated and persisted (feature 10)
 *   - PUT / PATCH / DELETE match on `(id, user_id)` (see lib/ownership). They
 *     previously matched on `id` alone, so a guessed UUID could edit or delete
 *     another account's rule
 *
 * The wire contract is unchanged: `content` is still accepted as an alias for
 * `response_content`, and `userId` is still supplied by the client.
 */

interface AutomationBody {
  id?: string
  userId?: unknown
  name?: string
  trigger_source?: string
  trigger_type?: string
  trigger_value?: string
  content?: unknown
  response_content?: unknown
  follow_up_steps?: unknown
  specific_media_id?: string | null
  is_active?: boolean
  action?: string
}

export async function GET(request: NextRequest) {
  return handle(async () => {
    const userId = parseUserId(request.nextUrl.searchParams.get("userId"))
    const supabase = await getSupabaseServerClient()

    const { data, error } = await supabase
      .from("automations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) throw new ApiError(500, "Could not load your automations.", "automations_list_failed")
    return NextResponse.json(data)
  })
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = (await request.json()) as AutomationBody
    const userId = parseUserId(body.userId)

    const parsed = automationUpsertSchema.safeParse({
      name: body.name,
      trigger_source: body.trigger_source,
      trigger_type: body.trigger_type,
      trigger_value: body.trigger_value,
      response_type: "pro",
      response_content: body.response_content ?? body.content,
      specific_media_id: body.specific_media_id,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) },
        { status: 400 },
      )
    }

    const steps = parseSteps(body.follow_up_steps)

    const supabase = await getSupabaseServerClient()
    // Fails with a clear 404 instead of a raw foreign-key error when the
    // signed-in account row no longer exists (stale session).
    await requireOwner(supabase, userId)

    // postback rules listen for a payload nobody can guess, generated once here
    // and attached to the buttons the user builds in the editor.
    const triggerValue =
      parsed.data.trigger_type === "postback"
        ? `PAYLOAD_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        : parsed.data.trigger_value.toLowerCase()

    const { data, error } = await supabase
      .from("automations")
      .insert({
        user_id: userId,
        name: parsed.data.name,
        trigger_source: parsed.data.trigger_source,
        trigger_type: parsed.data.trigger_type,
        trigger_value: triggerValue,
        response_type: "pro",
        response_content: parsed.data.response_content,
        follow_up_steps: steps,
        is_active: true,
        specific_media_id: parsed.data.specific_media_id ?? null,
      })
      .select()
      .single()

    if (error) throw new ApiError(500, `Could not save the rule: ${error.message}`, "create_failed")
    return NextResponse.json(data, { status: 201 })
  })
}

export async function PUT(request: NextRequest) {
  return handle(async () => {
    const body = (await request.json()) as AutomationBody
    const userId = parseUserId(body.userId)
    if (!body.id) throw new ApiError(400, "Which rule should be updated?", "missing_id")

    const parsed = automationUpsertSchema.safeParse({
      name: body.name,
      trigger_source: body.trigger_source,
      trigger_type: body.trigger_type,
      trigger_value: body.trigger_value,
      response_content: body.response_content ?? body.content,
      specific_media_id: body.specific_media_id,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) },
        { status: 400 },
      )
    }

    const steps = parseSteps(body.follow_up_steps)
    const supabase = await getSupabaseServerClient()

    // The update is scoped to the owner. A foreign id matches zero rows, so it
    // surfaces as a 404 rather than silently succeeding.
    const { data, error } = await supabase
      .from("automations")
      .update({
        name: parsed.data.name,
        trigger_source: parsed.data.trigger_source,
        trigger_type: parsed.data.trigger_type,
        trigger_value: parsed.data.trigger_value.toLowerCase(),
        response_content: parsed.data.response_content,
        follow_up_steps: steps,
        specific_media_id: parsed.data.specific_media_id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle()

    if (error) throw new ApiError(500, `Could not update the rule: ${error.message}`, "update_failed")
    if (!data) throw new ApiError(404, "That rule no longer exists.", "not_found")

    return NextResponse.json(data)
  })
}

export async function PATCH(request: NextRequest) {
  return handle(async () => {
    const body = (await request.json()) as AutomationBody
    const userId = parseUserId(body.userId)
    if (!body.id) throw new ApiError(400, "Which rule should be updated?", "missing_id")

    const supabase = await getSupabaseServerClient()

    if (body.action === "duplicate") {
      const original = await findOwned<Record<string, unknown>>(
        supabase,
        "automations",
        body.id,
        "user_id",
        userId,
      )
      if (!original) throw new ApiError(404, "That rule no longer exists.", "not_found")

      const { id: _id, created_at: _c, updated_at: _u, ...rest } = original
      const { data, error } = await supabase
        .from("automations")
        // user_id is carried over rather than copied from the client body.
        .insert({ ...rest, user_id: userId, name: `${original.name} (copy)`, is_active: false })
        .select()
        .single()

      if (error) throw new ApiError(500, `Could not duplicate the rule: ${error.message}`, "duplicate_failed")
      return NextResponse.json(data, { status: 201 })
    }

    if (typeof body.is_active !== "boolean") {
      throw new ApiError(400, "Nothing to change.", "missing_is_active")
    }

    const { data, error } = await supabase
      .from("automations")
      .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle()

    if (error) throw new ApiError(500, `Could not update the rule: ${error.message}`, "update_failed")
    if (!data) throw new ApiError(404, "That rule no longer exists.", "not_found")

    return NextResponse.json(data)
  })
}

export async function DELETE(request: NextRequest) {
  return handle(async () => {
    const userId = parseUserId(request.nextUrl.searchParams.get("userId"))
    const id = request.nextUrl.searchParams.get("id")
    if (!id) throw new ApiError(400, "Which rule should be deleted?", "missing_id")

    const supabase = await getSupabaseServerClient()

    // Active sessions and queued steps cascade with the rule, so a deleted rule
    // cannot keep sending.
    const { data, error } = await supabase
      .from("automations")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle()

    if (error) throw new ApiError(500, `Could not delete the rule: ${error.message}`, "delete_failed")
    if (!data) throw new ApiError(404, "That rule no longer exists.", "not_found")

    return NextResponse.json({ success: true, id })
  })
}

function parseSteps(raw: unknown): unknown[] | null {
  if (raw === undefined || raw === null) return null
  const parsed = followUpStepsSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(
      400,
      parsed.error.issues[0]?.message ?? "Those funnel steps are not valid.",
      "invalid_follow_up_steps",
    )
  }
  return parsed.data
}