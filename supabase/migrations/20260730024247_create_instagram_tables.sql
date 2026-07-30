/*
# Instagram Outreach Foundation — Tables & RLS

1. Purpose
   Stores Instagram account connections, incoming webhook events from Meta,
   auto-comment rules, and scheduled/published posts. Enables the app to
   receive real-time Instagram updates (comments, DMs, mentions) via a webhook
   edge function and to manage posting and automatic commenting.

2. New Tables

   a) instagram_accounts
      - id (uuid PK)
      - user_id (uuid, owner, defaults to auth.uid())
      - ig_user_id (text) — Instagram-scoped user ID from Meta
      - username (text)
      - access_token (text) — long-lived access token
      - token_expires_at (timestamptz)
      - connected (boolean, default false)
      - created_at / updated_at (timestamptz)

   b) instagram_webhook_events
      - id (uuid PK)
      - user_id (uuid, owner)
      - event_id (text) — Meta's event id for dedup, UNIQUE
      - event_type (text) — e.g. 'comment', 'message', 'mention'
      - ig_user_id (text) — the Instagram account the event is about
      - sender_id (text)
      - sender_username (text)
      - media_id (text) — post/media id if applicable
      - comment_id (text) — comment id if applicable
      - message_text (text) — comment or DM text
      - raw_event (jsonb) — full Meta payload
      - processed (boolean, default false)
      - created_at (timestamptz)
      UNIQUE on event_id to deduplicate Meta retries.

   c) instagram_auto_rules
      - id (uuid PK)
      - user_id (uuid, owner, defaults to auth.uid())
      - media_id (text, nullable — null means all posts)
      - trigger_keyword (text)
      - reply_text (text)
      - active (boolean, default true)
      - created_at / updated_at (timestamptz)

   d) instagram_posts
      - id (uuid PK)
      - user_id (uuid, owner, defaults to auth.uid())
      - ig_media_id (text, nullable — set after publishing)
      - caption (text)
      - status (text) — 'draft' | 'scheduled' | 'published' | 'failed'
      - scheduled_for (timestamptz, nullable)
      - published_at (timestamptz, nullable)
      - permalink (text, nullable)
      - created_at / updated_at (timestamptz)

3. Security
   - All tables get RLS enabled.
   - Owner-scoped CRUD policies for authenticated users (user_id defaults to auth.uid()).

4. Indexes
   - instagram_webhook_events on (user_id, created_at)
   - instagram_auto_rules on (user_id, active)
   - instagram_posts on (user_id, created_at)
*/

CREATE TABLE IF NOT EXISTS instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  ig_user_id text,
  username text,
  access_token text,
  token_expires_at timestamptz,
  connected boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ig_accounts" ON instagram_accounts;
CREATE POLICY "select_own_ig_accounts" ON instagram_accounts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ig_accounts" ON instagram_accounts;
CREATE POLICY "insert_own_ig_accounts" ON instagram_accounts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_ig_accounts" ON instagram_accounts;
CREATE POLICY "update_own_ig_accounts" ON instagram_accounts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_ig_accounts" ON instagram_accounts;
CREATE POLICY "delete_own_ig_accounts" ON instagram_accounts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS instagram_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id text UNIQUE,
  event_type text,
  ig_user_id text,
  sender_id text,
  sender_username text,
  media_id text,
  comment_id text,
  message_text text,
  raw_event jsonb,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE instagram_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ig_webhook_events" ON instagram_webhook_events;
CREATE POLICY "select_own_ig_webhook_events" ON instagram_webhook_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ig_webhook_events" ON instagram_webhook_events;
CREATE POLICY "insert_own_ig_webhook_events" ON instagram_webhook_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_ig_webhook_events" ON instagram_webhook_events;
CREATE POLICY "update_own_ig_webhook_events" ON instagram_webhook_events FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_ig_webhook_events" ON instagram_webhook_events;
CREATE POLICY "delete_own_ig_webhook_events" ON instagram_webhook_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS instagram_auto_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  media_id text,
  trigger_keyword text NOT NULL,
  reply_text text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE instagram_auto_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ig_auto_rules" ON instagram_auto_rules;
CREATE POLICY "select_own_ig_auto_rules" ON instagram_auto_rules FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ig_auto_rules" ON instagram_auto_rules;
CREATE POLICY "insert_own_ig_auto_rules" ON instagram_auto_rules FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_ig_auto_rules" ON instagram_auto_rules;
CREATE POLICY "update_own_ig_auto_rules" ON instagram_auto_rules FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_ig_auto_rules" ON instagram_auto_rules;
CREATE POLICY "delete_own_ig_auto_rules" ON instagram_auto_rules FOR DELETE
  TO authenticated USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS instagram_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  ig_media_id text,
  caption text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  scheduled_for timestamptz,
  published_at timestamptz,
  permalink text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ig_posts" ON instagram_posts;
CREATE POLICY "select_own_ig_posts" ON instagram_posts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ig_posts" ON instagram_posts;
CREATE POLICY "insert_own_ig_posts" ON instagram_posts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_ig_posts" ON instagram_posts;
CREATE POLICY "update_own_ig_posts" ON instagram_posts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_ig_posts" ON instagram_posts;
CREATE POLICY "delete_own_ig_posts" ON instagram_posts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);


CREATE INDEX IF NOT EXISTS idx_ig_webhook_events_user_created
  ON instagram_webhook_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ig_auto_rules_user_active
  ON instagram_auto_rules (user_id, active);

CREATE INDEX IF NOT EXISTS idx_ig_posts_user_created
  ON instagram_posts (user_id, created_at DESC);
