import { NextResponse } from "next/server"
import { getSupabaseAdmin, type SupabaseClient } from "./supabase-admin"

/**
 * Ownership guard for every API route touched by features 6-12.
 *
 * Background note: this app identifies the account with a client-supplied
 * `userId` and has no Supabase Auth session, and the service-role key bypasses
 * RLS entirely. Full Auth adoption is out of scope for features 6-12, so this
 * module centralises the checks that DO matter for the new surfaces:
 *
 *   - a missing / non-numeric user id is a 400, never a silent "all rows"
 *   - every read is filtered by the owning user id
 *   - every update and delete matches on (id, user_id) so a foreign id 404s
 *   - storage paths are namespaced by user id and verified before use
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = "error",
  ) {
    super(message)
    this.name = "ApiError"
  }
}

/**
 * Instagram account ids are 16–19 digit bigints and routinely exceed
 * `Number.MAX_SAFE_INTEGER`. They are carried as strings everywhere so the
 * exact value survives JSON, localStorage and Postgres BIGINT comparisons;
 * converting through `Number` would silently round an id into another account.
 */
export type UserId = string

export interface OwnerAccount {
  id: UserId
  username: string
  access_token: string
  dm_daily_limit: number
  dm_min_spacing_secs: number
  dm_window_hours: number
}

/**
 * Accepts a numeric string (or number) and returns the exact digit string.
 * Throws ApiError(400) for anything that is not a positive, leading-zero-free
 * integer of at most 19 digits (the BIGINT range).
 */
export function parseUserId(value: unknown): UserId {
  const raw = Array.isArray(value) ? value[0] : value
  const text =
    typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : ""
  if (!/^[1-9]\d{0,18}$/.test(text)) {
    throw new ApiError(400, "A valid account id is required.", "invalid_user_id")
  }
  return text
}

/**
 * Resolve the account row and its sending limits.
 * Throws 404 when the account does not exist so callers never operate on a
 * half-initialised account.
 */
export async function requireOwner(supabase: SupabaseClient, userId: UserId): Promise<OwnerAccount> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, username, access_token, dm_daily_limit, dm_min_spacing_secs, dm_window_hours",
    )
    .eq("id", userId)
    .maybeSingle()

  if (error) throw new ApiError(500, "Could not load your account.", "account_lookup_failed")
  if (!data) throw new ApiError(404, "Account not found.", "account_not_found")

  return {
    id: String(data.id),
    username: data.username,
    access_token: data.access_token,
    dm_daily_limit: Number(data.dm_daily_limit ?? 250),
    dm_min_spacing_secs: Number(data.dm_min_spacing_secs ?? 60),
    dm_window_hours: Number(data.dm_window_hours ?? 24),
  }
}

/**
 * Match an owned row. Returns null (rather than throwing) so route handlers
 * can raise their own 404 message.
 *
 * The `.eq(ownerColumn, userId)` is the load-bearing part: without it a
 * guessed UUID would let one account read or mutate another account's data.
 */
export async function findOwned<T = unknown>(
  supabase: SupabaseClient,
  table: string,
  id: string,
  ownerColumn: string,
  userId: UserId,
  columns = "*",
): Promise<T | null> {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("id", id)
    .eq(ownerColumn, userId)
    .maybeSingle()

  if (error) throw new ApiError(500, "Could not load that record.", "lookup_failed")
  return (data as T) ?? null
}

/** Uniform JSON error shape so every route reports failures the same way. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  const message = error instanceof Error ? error.message : "Something went wrong."
  console.error("[api] unhandled error:", error)
  return NextResponse.json(
    { error: message || "Something went wrong.", code: "unexpected_error" },
    { status: 500 },
  )
}

/** Convenience wrapper: run a handler and funnel every throw through errorResponse. */
export async function handle(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn()
  } catch (error) {
    return errorResponse(error)
  }
}

export { getSupabaseAdmin }
export type { SupabaseClient }