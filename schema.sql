-- Supabase Database Schema — Insta-P8
-- This file is the canonical source of truth for the database structure.
-- Run it directly in the Supabase SQL editor, or let the migration runner
-- (`lib/supabase-migrate.ts`) sync it automatically on deploy.
--
-- Auto-migration scope (lib/supabase-migrate.ts handles on every cold start):
--   * CREATE TABLE IF NOT EXISTS
--   * CREATE INDEX IF NOT EXISTS
--   * CREATE EXTENSION IF NOT EXISTS
--
-- Manual one-time setup (apply via Supabase SQL editor -- anon role required):
--   * CREATE POLICY (RLS)
--   * ALTER TABLE ... ENABLE ROW LEVEL SECURITY
--   * CREATE OR REPLACE FUNCTION (RPCs)
--
-- Design rules:
--   * Every CREATE uses IF NOT EXISTS — safe to re-run.
--   * No DROP TABLE statements anywhere. Existing data is preserved.
--   * Additive changes only. New columns get DEFAULT values.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. Table: public.users
-- ==========================================
CREATE TABLE IF NOT EXISTS public.users (
  id BIGINT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  business_account_id BIGINT,
  page_id TEXT,
  groq_auto_reply_enabled BOOLEAN DEFAULT FALSE,
  ai_context TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. Table: public.conversations
-- ==========================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL,
  recipient_username TEXT NOT NULL,
  last_message_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, recipient_id)
);

-- ==========================================
-- 3. Table: public.messages
-- ==========================================
CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_username TEXT NOT NULL,
  content TEXT NOT NULL,
  is_from_instagram BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 4. Table: public.webhook_events
-- ==========================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id BIGINT,
  data JSONB,
  processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 5. Table: public.automations
-- ==========================================
CREATE TABLE IF NOT EXISTS public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_value TEXT NOT NULL,
  response_type TEXT DEFAULT 'text'::text,
  response_content JSONB,
  media_selection JSONB,
  selected_reel_id TEXT,
  specific_media_id TEXT,
  trigger_source TEXT NOT NULL DEFAULT 'comment' CHECK (trigger_source IN ('comment', 'dm', 'story')),
  follow_up_steps JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 6. Table: public.media_cache
-- ==========================================
CREATE TABLE IF NOT EXISTS public.media_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  caption TEXT,
  image_url TEXT,
  video_url TEXT,
  permalink TEXT,
  media_product_type TEXT,
  timestamp TIMESTAMPTZ,
  cached_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, media_id)
);

-- ==========================================
-- 7. Table: public.ice_breakers
-- ==========================================
CREATE TABLE IF NOT EXISTS public.ice_breakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  response TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 8. Table: public.content_pool
-- ==========================================
CREATE TABLE IF NOT EXISTS public.content_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  caption TEXT,
  cover_url TEXT,
  sequence_index SERIAL,
  thumbnail_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  automation_template JSONB
);

-- ==========================================
-- 9. Table: public.scheduler_config
-- ==========================================
CREATE TABLE IF NOT EXISTS public.scheduler_config (
  user_id BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  interval_minutes INTEGER NOT NULL DEFAULT 240,
  start_time TIME DEFAULT '09:00:00'::TIME WITHOUT TIME ZONE,
  end_time TIME DEFAULT '21:00:00'::TIME WITHOUT TIME ZONE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  current_sequence_index INTEGER DEFAULT 1,
  is_running BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 10. Table: public.reels_posts
-- ==========================================
CREATE TABLE IF NOT EXISTS public.reels_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_pool_id UUID REFERENCES public.content_pool(id) ON DELETE SET NULL,
  video_url TEXT NOT NULL,
  caption TEXT,
  ig_container_id TEXT,
  ig_media_id TEXT,
  status TEXT DEFAULT 'PENDING'::text,
  error_message TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 11. Table: public.dm_queue
-- ==========================================
CREATE TABLE IF NOT EXISTS public.dm_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  message TEXT NOT NULL,
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- 12. Table: public.unlock_attempts
-- Purpose: Persistent counter so the 3-attempt gate cap works across
-- serverless Vercel instances. Each Vercel invocation has its own JS
-- memory, so without this table the in-Map would reset between requests
-- and the user could spam the gate card indefinitely.
-- The bump_unlock_attempt RPC (defined below) increments the counter
-- atomically to avoid races between concurrent invocations.
-- ==========================================
CREATE TABLE IF NOT EXISTS public.unlock_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- Indexes for performance
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_automations_trigger_source ON public.automations(trigger_source);
CREATE INDEX IF NOT EXISTS idx_automations_user_source ON public.automations(user_id, trigger_source);
CREATE INDEX IF NOT EXISTS idx_content_pool_user_sequence ON public.content_pool(user_id, sequence_index);
CREATE INDEX IF NOT EXISTS idx_scheduler_next_run ON public.scheduler_config(next_run_at);
CREATE INDEX IF NOT EXISTS idx_reels_posts_user_status ON public.reels_posts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_unlock_attempts_updated ON public.unlock_attempts(updated_at);

-- ==========================================
-- Storage Bucket: reels
-- ==========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('reels', 'reels', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop storage policies if they exist to prevent duplicates
DROP POLICY IF EXISTS "Public Uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public Viewing" ON storage.objects;
DROP POLICY IF EXISTS "Public Deletion" ON storage.objects;

-- Create policies for storage
CREATE POLICY "Public Uploads"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'reels');

CREATE POLICY "Public Viewing"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'reels');

CREATE POLICY "Public Deletion"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'reels');

-- =========================================================================
-- SECURITY: Row Level Security (RLS) for public schema tables
--
-- Service-role key (server-side) bypasses RLS, so this only restricts the
-- anon role. The frontend uses the anon key via Supabase Auth to read its
-- own data after sign-in. The policies below enforce per-user ownership
-- for every table that has user_id.
--
-- Tables WITHOUT user_id (webhook_events, unlock_attempts) deny all anon
-- access by default; only the service-role key can read them.
-- =========================================================================

-- ---------- Per-user policies ----------

-- Drop in case of re-run
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "conversations_select_own" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert_own" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update_own" ON public.conversations;
DROP POLICY IF EXISTS "messages_select_own" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_own" ON public.messages;
DROP POLICY IF EXISTS "automations_select_own" ON public.automations;
DROP POLICY IF EXISTS "automations_insert_own" ON public.automations;
DROP POLICY IF EXISTS "automations_update_own" ON public.automations;
DROP POLICY IF EXISTS "automations_delete_own" ON public.automations;
DROP POLICY IF EXISTS "media_cache_select_own" ON public.media_cache;
DROP POLICY IF EXISTS "ice_breakers_select_own" ON public.ice_breakers;
DROP POLICY IF EXISTS "ice_breakers_insert_own" ON public.ice_breakers;
DROP POLICY IF EXISTS "ice_breakers_update_own" ON public.ice_breakers;
DROP POLICY IF EXISTS "ice_breakers_delete_own" ON public.ice_breakers;
DROP POLICY IF EXISTS "content_pool_select_own" ON public.content_pool;
DROP POLICY IF EXISTS "content_pool_insert_own" ON public.content_pool;
DROP POLICY IF EXISTS "content_pool_update_own" ON public.content_pool;
DROP POLICY IF EXISTS "content_pool_delete_own" ON public.content_pool;
DROP POLICY IF EXISTS "scheduler_config_select_own" ON public.scheduler_config;
DROP POLICY IF EXISTS "scheduler_config_upsert_own" ON public.scheduler_config;
DROP POLICY IF EXISTS "reels_posts_select_own" ON public.reels_posts;
DROP POLICY IF EXISTS "reels_posts_insert_own" ON public.reels_posts;
DROP POLICY IF EXISTS "reels_posts_update_own" ON public.reels_posts;
DROP POLICY IF EXISTS "dm_queue_select_own" ON public.dm_queue;

-- users: a row is visible only to its own authenticated user (id matches)
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO anon, authenticated
  USING (id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- conversations: anyone signed-in can see their own conversations
CREATE POLICY "conversations_select_own" ON public.conversations
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "conversations_insert_own" ON public.conversations
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "conversations_update_own" ON public.conversations
  FOR UPDATE TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- messages: visible only to the owner of the conversation
CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "messages_insert_own" ON public.messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- automations
CREATE POLICY "automations_select_own" ON public.automations
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "automations_insert_own" ON public.automations
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "automations_update_own" ON public.automations
  FOR UPDATE TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "automations_delete_own" ON public.automations
  FOR DELETE TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- media_cache
CREATE POLICY "media_cache_select_own" ON public.media_cache
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- ice_breakers
CREATE POLICY "ice_breakers_select_own" ON public.ice_breakers
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "ice_breakers_insert_own" ON public.ice_breakers
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "ice_breakers_update_own" ON public.ice_breakers
  FOR UPDATE TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "ice_breakers_delete_own" ON public.ice_breakers
  FOR DELETE TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- content_pool
CREATE POLICY "content_pool_select_own" ON public.content_pool
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "content_pool_insert_own" ON public.content_pool
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "content_pool_update_own" ON public.content_pool
  FOR UPDATE TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "content_pool_delete_own" ON public.content_pool
  FOR DELETE TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- scheduler_config
CREATE POLICY "scheduler_config_select_own" ON public.scheduler_config
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "scheduler_config_upsert_own" ON public.scheduler_config
  FOR ALL TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- reels_posts
CREATE POLICY "reels_posts_select_own" ON public.reels_posts
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "reels_posts_insert_own" ON public.reels_posts
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "reels_posts_update_own" ON public.reels_posts
  FOR UPDATE TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- dm_queue
CREATE POLICY "dm_queue_select_own" ON public.dm_queue
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::text);

-- Now enable RLS on every table. With policies above, anon reads are
-- either per-user (ownership check) or denied (no policies defined).
-- Service-role key bypasses RLS for the server-side routes.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ice_breakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduler_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unlock_attempts ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- RPC: bump_unlock_attempt -- atomic increment with TTL reset
-- Replaces the read-modify-write pattern that lost concurrent attempts.
-- Concurrent invocations of the same key now serialize at the DB level
-- rather than at the JS level, so no bumps are ever lost.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.bump_unlock_attempt(p_key TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.unlock_attempts (key, count, updated_at)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE
    SET count = public.unlock_attempts.count + 1,
        updated_at = NOW()
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

-- =========================================================================
-- Periodic cleanup of stale unlock_attempts (older than 24h).
-- Set up via Supabase pg_cron (Dashboard -> Database -> Extensions -> pg_cron), then:
--   SELECT cron.schedule('purge-unlock-attempts', '0 * * * *',
--     $$DELETE FROM public.unlock_attempts WHERE updated_at < NOW() - INTERVAL '24 hours'$$);
-- Or run manually in the SQL editor:
--   DELETE FROM public.unlock_attempts WHERE updated_at < NOW() - INTERVAL '24 hours';
-- =========================================================================


-- =========================================================================
-- FEATURES 6-12: analytics, funnels, queue, templates, media
-- =========================================================================
--
-- MIGRATION NOTES (read before applying)
--
-- 1. Sections 13, 14, 16, 17, 18 below use CREATE TABLE / CREATE INDEX IF NOT
--    EXISTS, so lib/supabase-migrate.ts applies them automatically on cold start.
--
-- 2. Section 15 (dm_queue rebuild) and the users limit columns use ALTER TABLE,
--    which the auto-migration parser does NOT collect. Apply section 15 and the
--    ALTER TABLE in section 13b manually via the Supabase SQL editor the first
--    time. They are idempotent, so re-running is safe.
--
-- 3. lib/supabase-migrate.ts executes through an `exec_sql` RPC. If that RPC is
--    absent the runner logs a warning and stops. Every statement below is
--    therefore written to also be valid when pasted directly into the SQL editor.
-- =========================================================================

-- =========================================================================
-- 13. Per-user sending limits (Feature 9: rate limiting / messaging window)
-- Idempotent ALTERs. Applied manually on first run (auto-migration does not
-- collect ALTER TABLE). Safe to re-run.
-- =========================================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS dm_daily_limit      INTEGER NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS dm_min_spacing_secs INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS dm_window_hours     INTEGER NOT NULL DEFAULT 24;

-- =========================================================================
-- 14. Table: public.funnel_sessions (Feature 10: multistep funnels)
-- Created before automation_events so the FK resolves on a cold database.
-- The UNIQUE constraint makes funnel entry idempotent: a recipient who
-- re-triggers the same automation continues the existing session instead of
-- restarting the funnel.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.funnel_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  recipient_id TEXT NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'abandoned', 'failed')),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (automation_id, recipient_id, conversation_id)
);

-- =========================================================================
-- 15. Rebuild public.dm_queue in place (Feature 9)
--
-- The legacy shape (user_id TEXT, access_token TEXT NOT NULL, message TEXT
-- NOT NULL) is unusable and unsafe: it duplicates the Meta access token on
-- every queued row and has no foreign key, no idempotency key and no retry
-- metadata. Nothing in the application reads this table, so it has been
-- upgraded in place rather than dropped, per the "no DROP TABLE" rule.
--
-- owner_id is the real foreign key. The legacy user_id / access_token /
-- message columns are retained but relaxed to nullable so that existing rows
-- survive and new rows can use owner_id / content instead.
--
-- Apply this section manually once (ALTER TABLE is not auto-migrated).
-- =========================================================================
ALTER TABLE public.dm_queue ALTER COLUMN access_token DROP NOT NULL;
ALTER TABLE public.dm_queue ALTER COLUMN message     DROP NOT NULL;

ALTER TABLE public.dm_queue
  ADD COLUMN IF NOT EXISTS owner_id         BIGINT REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS automation_id    UUID REFERENCES public.automations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS conversation_id  UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS funnel_session_id UUID REFERENCES public.funnel_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recipient_id     TEXT,
  ADD COLUMN IF NOT EXISTS recipient_username TEXT,
  ADD COLUMN IF NOT EXISTS comment_id       TEXT,
  ADD COLUMN IF NOT EXISTS kind             TEXT,
  ADD COLUMN IF NOT EXISTS trigger_source   TEXT,
  ADD COLUMN IF NOT EXISTS trigger_type     TEXT,
  ADD COLUMN IF NOT EXISTS step_index       INTEGER,
  ADD COLUMN IF NOT EXISTS step_name        TEXT,
  ADD COLUMN IF NOT EXISTS is_conversion_step BOOLEAN,
  ADD COLUMN IF NOT EXISTS content          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS priority         INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS claimed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dedupe_key       TEXT,
  ADD COLUMN IF NOT EXISTS max_attempts     INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS latency_ms       INTEGER,
  ADD COLUMN IF NOT EXISTS last_error       TEXT;

-- Widen the legacy status domain to the queue's real lifecycle.
ALTER TABLE public.dm_queue DROP CONSTRAINT IF EXISTS dm_queue_status_check;
ALTER TABLE public.dm_queue
  ADD CONSTRAINT dm_queue_status_check CHECK (status IN
    ('pending', 'processing', 'sent', 'failed', 'blocked_window', 'rate_limited', 'cancelled'));

-- =========================================================================
-- 16. Table: public.automation_events (Features 6 & 7: funnel analytics)
-- The single source of truth for every analytics figure in the product.
--
-- automation_id is ON DELETE SET NULL and automation_name is denormalized, so
-- deleting a rule never destroys its historical performance record.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.automation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  automation_id UUID REFERENCES public.automations(id) ON DELETE SET NULL,
  automation_name TEXT,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  funnel_session_id UUID REFERENCES public.funnel_sessions(id) ON DELETE SET NULL,
  recipient_id TEXT,
  trigger_source TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN
    ('matched', 'queued', 'sent', 'failed', 'blocked_window', 'rate_limited',
     'gated', 'step_entered', 'advanced', 'completed', 'abandoned')),
  step_index INTEGER,
  step_name TEXT,
  latency_ms INTEGER,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- 17. Table: public.automation_templates (Feature 8: templates)
-- Seeded by an idempotent server-side upsert in app/api/automation-templates,
-- so the rows are real persisted backend data and self-heal on cold start
-- without depending on the exec_sql migration path.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.automation_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  accent TEXT NOT NULL,
  category TEXT NOT NULL,
  payload JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- 18. Table: public.uploaded_media (Feature 11: media uploads)
-- Tracks ownership so media can be listed and deleted. Deleting the row also
-- removes the Storage object, so no orphaned files accumulate.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.uploaded_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  object_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio')),
  size_bytes BIGINT NOT NULL,
  original_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, bucket, object_path)
);

-- =========================================================================
-- Indexes for features 6-12
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_funnel_sessions_user_status
  ON public.funnel_sessions(user_id, status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_sessions_recipient
  ON public.funnel_sessions(user_id, recipient_id, status);

-- Exactly-once semantics: a re-delivered webhook event or a double tap cannot
-- produce a duplicate DM.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dm_queue_dedupe
  ON public.dm_queue(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dm_queue_claim
  ON public.dm_queue(owner_id, status, send_at)
  WHERE status IN ('pending', 'rate_limited');
CREATE INDEX IF NOT EXISTS idx_dm_queue_session
  ON public.dm_queue(funnel_session_id, step_index) WHERE funnel_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_events_user_created
  ON public.automation_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_events_user_type
  ON public.automation_events(user_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_events_rule
  ON public.automation_events(automation_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_events_session
  ON public.automation_events(funnel_session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_automation_events_source
  ON public.automation_events(user_id, trigger_source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_uploaded_media_user_created
  ON public.uploaded_media(user_id, created_at DESC);

-- =========================================================================
-- Storage Bucket: dm-media (Feature 11)
-- Public because Meta's servers fetch the media URL server-side when
-- delivering a DM. Object paths are namespaced {userId}/{uuid}.{ext} so
-- ownership can be verified from the path.
-- =========================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('dm-media', 'dm-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "dm_media_select" ON storage.objects;
CREATE POLICY "dm_media_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'dm-media');

-- =========================================================================
-- RPC: claim_dm_queue -- atomically claim due messages for delivery
--
-- FOR UPDATE SKIP LOCKED guarantees that concurrent webhook invocations and
-- the cron drain never claim the same row, so a message can never be sent
-- twice. Applying the UPDATE through a CTE keeps the lock held for the whole
-- claim+transition, which also makes the attempt counter race-free.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.claim_dm_queue(
  p_owner_id BIGINT,
  p_limit INTEGER DEFAULT 5
)
RETURNS SETOF public.dm_queue
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT id
    FROM public.dm_queue
    WHERE owner_id = p_owner_id
      AND status IN ('pending', 'rate_limited')
      AND send_at <= NOW()
    ORDER BY priority ASC, send_at ASC
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.dm_queue q
  SET status = 'processing',
      claimed_at = NOW(),
      attempts = q.attempts + 1
  FROM due d
  WHERE q.id = d.id
  RETURNING q.*;
END;
$$;

-- =========================================================================
-- RLS for the feature 6-12 tables
--
-- dm_queue now has a real BIGINT owner_id foreign key, so its policy is
-- redefined to match on owner_id instead of the legacy TEXT user_id.
-- =========================================================================
DROP POLICY IF EXISTS "dm_queue_select_own" ON public.dm_queue;
CREATE POLICY "dm_queue_select_own" ON public.dm_queue
  FOR SELECT TO anon, authenticated
  USING (owner_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

DROP POLICY IF EXISTS "funnel_sessions_select_own" ON public.funnel_sessions;
DROP POLICY IF EXISTS "automation_events_select_own" ON public.automation_events;
DROP POLICY IF EXISTS "automation_templates_select_own" ON public.automation_templates;
DROP POLICY IF EXISTS "uploaded_media_select_own" ON public.uploaded_media;
DROP POLICY IF EXISTS "uploaded_media_insert_own" ON public.uploaded_media;
DROP POLICY IF EXISTS "uploaded_media_delete_own" ON public.uploaded_media;

CREATE POLICY "funnel_sessions_select_own" ON public.funnel_sessions
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

CREATE POLICY "automation_events_select_own" ON public.automation_events
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- Templates are read-only reference data shared by every account.
CREATE POLICY "automation_templates_select_own" ON public.automation_templates
  FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY "uploaded_media_select_own" ON public.uploaded_media
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "uploaded_media_insert_own" ON public.uploaded_media
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
CREATE POLICY "uploaded_media_delete_own" ON public.uploaded_media
  FOR DELETE TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

ALTER TABLE public.funnel_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_media ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- Realtime (Phase 9): the dashboard subscribes to postgres_changes so
-- analytics and funnel progress update instantly across pages and tabs.
--
-- Realtime only emits for tables in the `supabase_realtime` publication.
-- The client pairs every subscription with a polling fallback, so the app
-- behaves correctly whether or not this is applied. To enable push updates:
--
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.automations;
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.funnel_sessions;
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_events;
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.uploaded_media;
-- =========================================================================
