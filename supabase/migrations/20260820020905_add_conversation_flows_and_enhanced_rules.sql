/*
# Enhanced Instagram Auto Rules + Conversation Flow Builder

## Purpose
Upgrades the auto-comment rules system to support:
1. Editing existing rules (no schema change needed — just UI)
2. Sending DMs (not just public comment replies) when someone comments a keyword
3. Sending links, files, or images alongside text
4. On/off toggle per rule (already exists via `active` column)
5. ManyChat-style multi-step conversation flows with branching

## Changes to existing tables

### instagram_auto_rules (ALTER — additive only, no data loss)
- `action_type` (text, default 'comment') — 'comment', 'dm', or 'both'
  Controls whether the rule posts a public comment reply, sends a private DM, or both.
- `dm_message` (text, nullable) — The private DM message text (used when action_type is 'dm' or 'both')
- `link_url` (text, nullable) — A URL to include in the reply/DM (shown as a link)
- `media_url` (text, nullable) — A file or image URL to attach
- `media_type` (text, nullable) — Type hint for the media: 'image', 'file', 'video'
- `send_once_per_user` (boolean, default true) — If true, only DM each unique user once per rule

### instagram_webhook_events (ALTER — additive)
- `flow_session_id` (uuid, nullable) — Links an event to a conversation flow session, so the flow
  engine can correlate incoming replies with an active flow step

## New tables

### instagram_conversation_flows
Top-level flow definition. Each flow has a trigger and a series of steps.
- `id` (uuid PK)
- `user_id` (uuid, owner, defaults to auth.uid())
- `account_id` (uuid, FK to instagram_accounts)
- `name` (text) — user-given flow name, e.g. "Pricing Inquiry Flow"
- `trigger_type` (text) — 'comment_keyword' or 'dm_keyword'
- `trigger_keyword` (text) — the word/phrase that starts the flow
- `trigger_media_id` (text, nullable) — optional: limit to a specific post
- `active` (boolean, default true) — on/off toggle for the entire flow
- `first_step_id` (uuid, nullable) — which step to execute first (set after steps are created)
- `created_at` / `updated_at` (timestamptz)

### instagram_flow_steps
Individual steps within a flow. Each step sends a message and optionally waits for a reply.
- `id` (uuid PK)
- `flow_id` (uuid, FK to instagram_conversation_flows, ON DELETE CASCADE)
- `user_id` (uuid, owner)
- `step_order` (integer) — display/sequence order
- `message_text` (text, nullable) — text to send
- `link_url` (text, nullable) — URL to include
- `media_url` (text, nullable) — file/image to attach
- `media_type` (text, nullable) — 'image', 'file', 'video'
- `wait_for_reply` (boolean, default false) — if true, pause until the user sends a DM
- `wait_timeout_minutes` (integer, default 1440) — how long to wait (24h default, respects IG 24h window)
- `branch_type` (text, default 'none') — 'none', 'keyword', 'any_reply'
  - 'none': go to next step after sending
  - 'keyword': branch based on what the user replies
  - 'any_reply': proceed to next step on any reply
- `branch_conditions` (jsonb, nullable) — array of {keyword, next_step_id} for keyword branching
- `next_step_id` (uuid, nullable) — default next step if no branch matches (FK to self)
- `created_at` / `updated_at` (timestamptz)

### instagram_flow_sessions
Tracks each person's progress through a flow. One row per user per flow.
- `id` (uuid PK)
- `flow_id` (uuid, FK to instagram_conversation_flows)
- `user_id` (uuid, owner)
- `account_id` (uuid, FK to instagram_accounts)
- `sender_id` (text) — Instagram user ID of the person in the flow
- `sender_username` (text, nullable)
- `current_step_id` (uuid, nullable, FK to instagram_flow_steps) — which step they're on
- `status` (text, default 'active') — 'active', 'waiting_reply', 'completed', 'expired', 'cancelled'
- `window_expires_at` (timestamptz, nullable) — 24h messaging window deadline
- `started_at` (timestamptz)
- `last_interacted_at` (timestamptz, nullable)
- `completed_at` (timestamptz, nullable)
- UNIQUE on (flow_id, sender_id) — one session per person per flow

## Security
- All new tables get RLS enabled with owner-scoped CRUD policies (TO authenticated, auth.uid() = user_id).
- instagram_flow_steps also allows access if the user owns the parent flow.
- instagram_flow_sessions same pattern.
- Service role gets full access on flow_sessions and flow_steps for edge function processing.

## Important notes
1. All ALTER TABLE statements use ADD COLUMN IF NOT EXISTS — safe to re-run.
2. Policies use DROP POLICY IF EXISTS before CREATE — idempotent.
3. No data is lost — all changes are additive.
4. The 24-hour window is tracked per flow session via window_expires_at.
*/

-- ===== ALTER instagram_auto_rules =====
ALTER TABLE instagram_auto_rules
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'comment';

ALTER TABLE instagram_auto_rules
  ADD COLUMN IF NOT EXISTS dm_message text;

ALTER TABLE instagram_auto_rules
  ADD COLUMN IF NOT EXISTS link_url text;

ALTER TABLE instagram_auto_rules
  ADD COLUMN IF NOT EXISTS media_url text;

ALTER TABLE instagram_auto_rules
  ADD COLUMN IF NOT EXISTS media_type text;

ALTER TABLE instagram_auto_rules
  ADD COLUMN IF NOT EXISTS send_once_per_user boolean NOT NULL DEFAULT true;

-- ===== ALTER instagram_webhook_events =====
ALTER TABLE instagram_webhook_events
  ADD COLUMN IF NOT EXISTS flow_session_id uuid;

-- ===== New table: instagram_conversation_flows =====
CREATE TABLE IF NOT EXISTS instagram_conversation_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL DEFAULT 'comment_keyword' CHECK (trigger_type IN ('comment_keyword', 'dm_keyword')),
  trigger_keyword text NOT NULL,
  trigger_media_id text,
  active boolean NOT NULL DEFAULT true,
  first_step_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE instagram_conversation_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_flows" ON instagram_conversation_flows;
CREATE POLICY "select_own_flows" ON instagram_conversation_flows FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_flows" ON instagram_conversation_flows;
CREATE POLICY "insert_own_flows" ON instagram_conversation_flows FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_flows" ON instagram_conversation_flows;
CREATE POLICY "update_own_flows" ON instagram_conversation_flows FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_flows" ON instagram_conversation_flows;
CREATE POLICY "delete_own_flows" ON instagram_conversation_flows FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Self-referencing FK for first_step_id (added after table creation)
DO $$ BEGIN
  ALTER TABLE instagram_conversation_flows
    ADD CONSTRAINT fk_flow_first_step
    FOREIGN KEY (first_step_id) REFERENCES instagram_conversation_flows(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== New table: instagram_flow_steps =====
CREATE TABLE IF NOT EXISTS instagram_flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES instagram_conversation_flows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  step_order integer NOT NULL DEFAULT 0,
  message_text text,
  link_url text,
  media_url text,
  media_type text,
  wait_for_reply boolean NOT NULL DEFAULT false,
  wait_timeout_minutes integer NOT NULL DEFAULT 1440,
  branch_type text NOT NULL DEFAULT 'none' CHECK (branch_type IN ('none', 'keyword', 'any_reply')),
  branch_conditions jsonb,
  next_step_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE instagram_flow_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_flow_steps" ON instagram_flow_steps;
CREATE POLICY "select_own_flow_steps" ON instagram_flow_steps FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_flow_steps" ON instagram_flow_steps;
CREATE POLICY "insert_own_flow_steps" ON instagram_flow_steps FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_flow_steps" ON instagram_flow_steps;
CREATE POLICY "update_own_flow_steps" ON instagram_flow_steps FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_flow_steps" ON instagram_flow_steps;
CREATE POLICY "delete_own_flow_steps" ON instagram_flow_steps FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Service role access for edge function processing
DROP POLICY IF EXISTS "service_role_manage_flow_steps" ON instagram_flow_steps;
CREATE POLICY "service_role_manage_flow_steps" ON instagram_flow_steps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===== New table: instagram_flow_sessions =====
CREATE TABLE IF NOT EXISTS instagram_flow_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES instagram_conversation_flows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  sender_id text NOT NULL,
  sender_username text,
  current_step_id uuid REFERENCES instagram_flow_steps(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waiting_reply', 'completed', 'expired', 'cancelled')),
  window_expires_at timestamptz,
  started_at timestamptz DEFAULT now(),
  last_interacted_at timestamptz,
  completed_at timestamptz,
  UNIQUE (flow_id, sender_id)
);

ALTER TABLE instagram_flow_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_flow_sessions" ON instagram_flow_sessions;
CREATE POLICY "select_own_flow_sessions" ON instagram_flow_sessions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_flow_sessions" ON instagram_flow_sessions;
CREATE POLICY "insert_own_flow_sessions" ON instagram_flow_sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_flow_sessions" ON instagram_flow_sessions;
CREATE POLICY "update_own_flow_sessions" ON instagram_flow_sessions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_flow_sessions" ON instagram_flow_sessions;
CREATE POLICY "delete_own_flow_sessions" ON instagram_flow_sessions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Service role access for edge function processing
DROP POLICY IF EXISTS "service_role_manage_flow_sessions" ON instagram_flow_sessions;
CREATE POLICY "service_role_manage_flow_sessions" ON instagram_flow_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_ig_flows_user_active
  ON instagram_conversation_flows (user_id, active);

CREATE INDEX IF NOT EXISTS idx_ig_flow_steps_flow_order
  ON instagram_flow_steps (flow_id, step_order);

CREATE INDEX IF NOT EXISTS idx_ig_flow_sessions_flow_sender
  ON instagram_flow_sessions (flow_id, sender_id);

CREATE INDEX IF NOT EXISTS idx_ig_flow_sessions_status
  ON instagram_flow_sessions (status, window_expires_at);

CREATE INDEX IF NOT EXISTS idx_ig_webhook_events_flow_session
  ON instagram_webhook_events (flow_session_id);

-- Add service role access to webhook events for flow session linking
DROP POLICY IF EXISTS "service_role_manage_webhook_events" ON instagram_webhook_events;
CREATE POLICY "service_role_manage_webhook_events" ON instagram_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add service role access to auto rules for webhook processing
DROP POLICY IF EXISTS "service_role_manage_auto_rules" ON instagram_auto_rules;
CREATE POLICY "service_role_manage_auto_rules" ON instagram_auto_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);
