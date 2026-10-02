# Paypage Autodm — Features 6–12 Implementation Plan

Status: **AWAITING APPROVAL**
Scope: Features 6–12 only. No unrelated features, routes, or data are introduced.

---

## 0. Verification of the existing implementation

Per the instruction to verify before rebuilding, here is what already works.

### Feature 9 — rate limiting / messaging window
`schema.sql` defines `dm_queue`, but **no application code references it** (only the auto-migration DDL list does). The webhook sends every reply inline via `lib/instagram-api.ts`. There is no throttling, no per-recipient pacing, no rolling 24-hour counter, and no retry. **Not implemented — build it.**

### Feature 10 — multistep funnels
`automations.follow_up_steps JSONB` exists in the schema but is **never read or written** by any code path. **Not implemented — build it.**

### Feature 11 — media uploads
`POST /api/instagram/media` lists Instagram media (proxying the Graph API). There is **no Storage bucket, no multipart upload endpoint, and no upload table**. `CreateRuleForm` collects a hand-typed media URL. **Not implemented — build it.**

### Feature 6 & 7 — funnel analytics + charts
`app/dashboard/analytics/page.tsx` is a "Coming soon" stub. `recharts` is installed and never imported. `GET /api/dashboard/stats` only computes message counts. No event table exists, so there is nothing to aggregate. **Not implemented — build it.**

### Feature 12 — rich response editor
This is the only partially-built item. Already present and working:
- `message`, `card` (with buttons/quick replies), `media.url`
- `typing_indicator`, `delay_seconds`, `check_follow`
- `reply_mode`, `public_replies`, `include_replies`
- 3-step wizard, manual + polished visual style

Remaining gaps to close: `mark_seen` is read by the engine but **not editable**; media is a URL field rather than an upload; card button URL/payload is unvalidated; no funnel-step UI. **Close these gaps — do not rewrite what works.**

---

## 1. Database design

All DDL is appended to `schema.sql` (the canonical source) and is idempotent. New table names must also be added to `EXPECTED_TABLES` in `lib/supabase-migrate.ts:21`.

> **Migration constraint (important):** `lib/supabase-migrate.ts` executes DDL through an `exec_sql` RPC. If that RPC is not present, it logs a warning and **silently stops** (`supabase-migrate.ts:56-67`). Therefore every new table, policy, and publication statement in this plan must also be applicable manually from `schema.sql`, and the manual SQL is documented in the handoff notes. I will not rely on auto-migration alone.

### 1.1 `automation_events` (new) — single fact table for all 6 analytics needs
```sql
CREATE TABLE IF NOT EXISTS automation_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  automation_id     UUID REFERENCES automations(id) ON DELETE SET NULL,
  automation_name   TEXT,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  recipient_id      TEXT,
  funnel_session_id UUID,
  trigger_source    TEXT NOT NULL,
  trigger_type      TEXT NOT NULL,
  event_type        TEXT NOT NULL,  -- matched|sent|queued|failed|blocked_window|
                                   -- rate_limited|gated|step_entered|advanced|
                                   -- completed|abandoned
  step_index        INTEGER,
  step_name         TEXT,
  latency_ms        INTEGER,
  error             TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_events_user_created
  ON automation_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_events_user_type
  ON automation_events(user_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_events_rule
  ON automation_events(automation_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_events_session
  ON automation_events(funnel_session_id, created_at);
```
`automation_id` is `ON DELETE SET NULL` and `automation_name` is denormalized, so deleting a rule never destroys its historical performance record — this satisfies referential integrity for analytics.

### 1.2 `funnel_sessions` (new)
```sql
CREATE TABLE IF NOT EXISTS funnel_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  automation_id     UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  recipient_id      TEXT NOT NULL,
  current_step      INTEGER NOT NULL DEFAULT 0,
  total_steps       INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','abandoned','failed')),
  entered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  UNIQUE (automation_id, recipient_id, conversation_id)
);
CREATE INDEX IF NOT EXISTS idx_funnel_sessions_user_status
  ON funnel_sessions(user_id, status, last_activity_at DESC);
```
The unique constraint makes funnel entry idempotent: a user re-triggering the same automation continues the existing session instead of restarting it.

### 1.3 `dm_queue` — rebuild in place (additive only)
Existing shape is `user_id TEXT, access_token TEXT, message TEXT NOT NULL, status, created_at` — unusable and unsafe (it stores the Meta access token per row). Because nothing reads the table, I will **not** drop it. Instead:
```sql
ALTER TABLE public.dm_queue ALTER COLUMN access_token DROP NOT NULL;
ALTER TABLE public.dm_queue ALTER COLUMN message     DROP NOT NULL;

ALTER TABLE public.dm_queue
  ADD COLUMN IF NOT EXISTS owner_id        BIGINT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS automation_id   UUID REFERENCES automations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS funnel_session_id UUID,
  ADD COLUMN IF NOT EXISTS recipient_id    TEXT,
  ADD COLUMN IF NOT EXISTS kind            TEXT,
  ADD COLUMN IF NOT EXISTS content         JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS priority        INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS send_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS attempts        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts    INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS claimed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dedupe_key      TEXT,
  ADD COLUMN IF NOT EXISTS last_error      TEXT;

ALTER TABLE public.dm_queue DROP CONSTRAINT IF EXISTS dm_queue_status_check;
ALTER TABLE public.dm_queue
  ADD CONSTRAINT dm_queue_status_check CHECK (status IN
    ('pending','processing','sent','failed','blocked_window','rate_limited','cancelled'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_dm_queue_dedupe
  ON dm_queue(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dm_queue_claim
  ON dm_queue(owner_id, status, send_at) WHERE status IN ('pending','rate_limited');
```
`dedupe_key` gives exactly-once semantics: re-processing the same webhook event or a user double-tapping cannot produce a duplicate DM.

### 1.4 `automation_templates` (new)
```sql
CREATE TABLE IF NOT EXISTS automation_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  icon          TEXT NOT NULL,
  accent        TEXT NOT NULL,
  category      TEXT NOT NULL,
  payload       JSONB NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
The 4 required templates are seeded by an **idempotent server-side upsert** (`INSERT … ON CONFLICT (id) DO UPDATE`) that runs on first call to `GET /api/automation-templates`. This is real persisted backend data — not code fixtures and not mock data. The upsert is self-healing on cold start and does not depend on `exec_sql`.

### 1.5 `uploaded_media` (new)
```sql
CREATE TABLE IF NOT EXISTS uploaded_media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bucket       TEXT NOT NULL,
  object_path  TEXT NOT NULL,
  public_url   TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('image','video','audio')),
  size_bytes   BIGINT NOT NULL,
  original_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, bucket, object_path)
);
CREATE INDEX IF NOT EXISTS idx_uploaded_media_user_created
  ON uploaded_media(user_id, created_at DESC);
```

### 1.6 Per-user sending limits
```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS dm_daily_limit       INTEGER NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS dm_min_spacing_secs  INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS dm_window_hours      INTEGER NOT NULL DEFAULT 24;
```
Per-account and configurable, so an account at Meta's limit can be lowered without a redeploy.

### 1.7 Storage
Public bucket `dm-media` (Meta must be able to fetch the URL server-side). Paths are namespaced `{userId}/{uuid}.{ext}`. Creation is idempotent via `storage.createBucket` with `public: true`, and RLS storage policies are written into `schema.sql` for manual application.

---

## 2. Feature 9 — rate limiting & 24-hour messaging-window compliance

New module `lib/messaging-window.ts` (single source of truth, unit-testable, no I/O in the decision functions):
- `canSend(ctx) → { allowed, reason, retryAfterSec }`
  - **Messaging window:** if the last inbound message from the recipient is older than `dm_window_hours` (comment private replies get a 7-day window per Meta policy), the item is marked `blocked_window` and never sent.
  - **Rolling 24-hour cap:** outbound count for the account in the last 24h vs `dm_daily_limit`.
  - **Per-recipient pacing:** minutes since the last outbound to that recipient vs `dm_min_spacing_secs`.
  - Priority order: window → daily cap → spacing.
- `enqueueMessage(...)` — inserts a `pending` row with `send_at = now + spacing` (the queue doubles as the pacer), returns the row.
- `drainQueue({ budgetMs, maxItems })` — claims rows with a Postgres RPC using `FOR UPDATE SKIP LOCKED` so concurrent invocations never double-send, sends, then transitions each row to `sent` / `retry` / `failed` with exponential backoff (1m, 5m, 25m) up to `max_attempts`.

**Webhook integration.** `app/api/instagram/webhook/route.ts` currently sleeps and sends inline for every branch. It will be changed to: enqueue → log a `queued` event → attempt an inline drain with a 4s / 5-item budget → return. A single reply therefore still feels instant, while bursts are paced and Meta timeouts are impossible. `vercel.json` adds a `* * * * *` cron calling `GET /api/cron/drain-queue` (guarded by `CRON_SECRET`) so queued follow-ups land even with no traffic.

This also removes the existing `sleep()`-inside-a-loop timeout risk without changing observable AutoDM behavior.

---

## 3. Feature 10 — multistep funnels

`follow_up_steps` becomes a real, validated contract:
```ts
type FunnelStep = {
  id: string
  name: string
  wait_minutes: number          // 0 = send immediately, else schedule via dm_queue
  content: MessageContent       // reuses the existing response_content shape
  advance_on: { kind: 'quick_reply'|'keyword'|'payload'|'timeout'; value: string }
  is_conversion_step?: boolean  // reaching this step == conversion
}
```
- `lib/funnels.ts` owns the state machine: `startSession`, `advanceSession`, `expireSessions`.
- Triggering an automation with ≥2 steps creates a `funnel_sessions` row (idempotent via the unique constraint), sends step 0 immediately, and enqueues every subsequent step at `now + wait_minutes`.
- Every inbound message is matched against the active session's `advance_on` before rule matching, so quick-reply and card-payload advancement works end-to-end.
- A session with no inbound activity for 24h transitions to `abandoned`, and a session reaching a `is_conversion_step` transitions to `completed`.

---

## 4. Feature 11 — media uploads

- `POST /api/media/upload` — multipart, zod-validated. MIME allowlist `jpeg/png/gif/mp4/mov/m4a/mp3`; size caps enforced (image 8MB, video 25MB, audio 25MB); rejects on mismatch between declared and sniffed type. Uploads to `dm-media/{userId}/{uuid}.{ext}`, records the row, returns the public URL.
- `GET /api/media` — paginated list for the account.
- `DELETE /api/media/[id]` — verifies ownership, removes the Storage object and the row.
- Wizard integration: the existing media URL input gains a file picker with drag-and-drop, client-side type/size pre-validation, upload progress, retry on failure, and an explicit remove action. The public URL is written into `content.media.url`, which `sendMediaDM` already consumes — so the existing send path is untouched.
- `next.config.mjs` already sets `images.unoptimized: true`, so no image-host allowlist change is needed.

---

## 5. Feature 12 — rich response editor (gap closure, not a rewrite)

1. `mark_seen` — new switch in the wizard's final step, already honoured by the engine.
2. Upload wiring for both `media.url` and `card.image_url`.
3. Card validation — `web_url` buttons must be `http(s)`; `postback` buttons must carry a payload; quick replies need a title. Enforced client-side for immediate feedback and server-side in the automations API so an invalid rule cannot be persisted or sent.
4. Funnel steps section — add/reorder/remove steps, per-step content builder, wait delay, advance trigger, and conversion-step toggle.

---

## 6. Features 6 & 7 — funnel analytics + charts

Every webhook branch and every manual inbox send writes an `automation_events` row, so analytics are real recorded history rather than recomputed guesses.

| API | Returns |
|---|---|
| `GET /api/analytics/overview?range=7d\|30d\|90d` | messages/day series (sent vs received), reply rate, top triggers, totals |
| `GET /api/analytics/rules?range=` | per-rule fires, delivered, failed, unique recipients, conversions, conversion rate |
| `GET /api/analytics/funnels?range=` | per-rule step counts, step-to-step drop-off, completion rate |

`app/dashboard/analytics/page.tsx` is replaced with:
- KPI row (messages sent, reply rate, active funnels, overall conversion rate)
- Messages-per-day area chart
- Top-triggers bar chart
- Per-rule performance table with conversion-rate bars
- Funnel step visualisation with drop-off between steps
- Range switcher, per-panel loading skeletons, empty states, and error retry

Charts use the already-installed, already-themed `components/ui/chart.tsx` (shadcn `ChartContainer` + `ChartTooltipContent`) so styling matches the existing design system. `app/dashboard/page.tsx` overview tiles are upgraded to show the new funnel totals.

---

## 7. Feature 8 — automation templates

`app/dashboard/automations/page.tsx` gains a template gallery (grid of `automation_templates`) above the rule list. Selecting one opens the existing 3-step wizard prefilled from `payload`; the user confirms, and the existing `POST /api/automations` persists a real automation. Templates: **Lead Magnet**, **Link in Bio DM**, **Price Request**, **Story Reply**. Each maps to a genuine trigger type already supported by the engine.

---

## 8. Auth & authorization model

The account is identified by `userId` in localStorage today; every API trusts it, and `PUT`/`PATCH`/`DELETE` on `/api/automations` are **not** scoped by `user_id` at all.

Full Supabase Auth adoption is **out of scope** for features 6–12 and would touch every route. What I will do, so these features are not shipped insecurely:
- New `lib/ownership.ts` with a single `requireOwnedUser()` guard used by every new and modified route.
- Every new table is filtered by `owner`/`user_id` on **read, write, and delete**; `GET` is scoped, `PUT`/`PATCH`/`DELETE` match on `(id, user_id)` and 404 otherwise.
- Storage operations are path-namespaced and ownership-checked.

The residual risk — an unverified client-supplied `userId` — is pre-existing and is documented, not silently expanded. Flagging it for a follow-up decision.

---

## 9. Realtime & cross-page sync

- New route `lib/supabase-browser.ts` exposing a browser client.
- New hooks subscribe to `postgres_changes` on `automations`, `funnel_sessions`, and `automation_events`, filtered by `user_id`, so analytics, the rule list, and funnel progress update instantly across pages and tabs.
- Because realtime requires the tables to be in the `supabase_realtime` publication (which cannot be guaranteed to auto-apply here), each subscription is paired with a **polling fallback**. Instant updates are delivered whether or not the publication is configured.
- `GET /api/dashboard/stats` and the analytics endpoints take a `since` parameter for incremental refresh rather than refetching everything.

---

## 10. Design, states & accessibility

- Reuse `Card`, `Badge`, `Dialog`, `Sheet`, `Table`, `TagInput`, `Field`, `StatCard`, `LoadingState`, `EmptyState`, `ErrorState`, `SlidingTabs` from `components/ui/`, plus the `.light` token scope added in the rebrand. No new visual language.
- Every new surface implements loading / empty / error-with-retry / success / empty-action states.
- Mobile-first; verified at 375, 768, and 1280px with no horizontal overflow.
- WCAG 2.2 AA: labelled controls, `aria-describedby` on errors, `role="alert"` on failure toasts, visible focus rings, keyboard-operable dialogs and template cards, `prefers-reduced-motion` respected, ≥44px touch targets, and AA contrast for new chart colors.

---

## 11. Testing & verification

- Pure functions in `lib/messaging-window.ts` and `lib/funnels.ts` are written dependency-free so they can be unit-tested.
- `npx tsc --noEmit` — mandatory, because `next.config.mjs` sets `typescript.ignoreBuildErrors: true` and would otherwise hide type errors.
- `npm run build`.
- End-to-end smoke checks against the local server: rule CRUD, template prefill, upload → send, funnel advance, rate-limit rejection, analytics reflecting a real event.
- ESLint cannot run in this repo (ESLint 10 installed, no `eslint.config.*`). Adding one is outside the approved scope, so it stays disabled and is reported as a known limitation.

---

## 12. Out of scope (flagged, not fixed without approval)

1. **`/api/groq/auto-reply` does not exist.** `app/dashboard/automations/page.tsx` renders an AI toggle that fetches it, producing a guaranteed 404. AI is not in features 6–12. The minimal honest repair is to remove the dead toggle; I need your call rather than silently deleting existing UI or silently adding an AI feature.
2. **Unauthenticated `userId`** — see §8.
3. **`/* @ts-nocheck */` on the webhook** — I will keep it and confine new logic to typed `lib/` modules rather than risk destabilising a working flow.
4. **Story/DM double-processing** in the webhook (story events appear in both the story and DM loops). I will fix it, because the funnel engine depends on each event being handled exactly once — flagging it as a required correctness fix rather than an optional one.