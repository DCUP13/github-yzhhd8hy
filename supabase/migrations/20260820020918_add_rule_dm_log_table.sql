/*
# Add DM tracking table for auto rules

## Purpose
Tracks which Instagram users have already been DMed by a specific auto rule,
so we don't send duplicate DMs to the same person.

## New table: instagram_rule_dm_log
- `id` (uuid PK)
- `rule_id` (uuid, FK to instagram_auto_rules, ON DELETE CASCADE)
- `user_id` (uuid, owner)
- `sender_id` (text) — Instagram user ID of the person who was DMed
- `sender_username` (text, nullable)
- `media_id` (text, nullable) — the post they commented on
- `comment_id` (text, nullable) — the specific comment that triggered it
- `dm_sent_at` (timestamptz) — when the DM was sent
- UNIQUE on (rule_id, sender_id) — one DM per person per rule

## Security
- RLS enabled, owner-scoped CRUD (TO authenticated, auth.uid() = user_id)
- Service role gets full access for edge function processing
*/

CREATE TABLE IF NOT EXISTS instagram_rule_dm_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES instagram_auto_rules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id text NOT NULL,
  sender_username text,
  media_id text,
  comment_id text,
  dm_sent_at timestamptz DEFAULT now(),
  UNIQUE (rule_id, sender_id)
);

ALTER TABLE instagram_rule_dm_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_rule_dm_log" ON instagram_rule_dm_log;
CREATE POLICY "select_own_rule_dm_log" ON instagram_rule_dm_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_rule_dm_log" ON instagram_rule_dm_log;
CREATE POLICY "insert_own_rule_dm_log" ON instagram_rule_dm_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_rule_dm_log" ON instagram_rule_dm_log;
CREATE POLICY "update_own_rule_dm_log" ON instagram_rule_dm_log FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_rule_dm_log" ON instagram_rule_dm_log;
CREATE POLICY "delete_own_rule_dm_log" ON instagram_rule_dm_log FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service_role_manage_rule_dm_log" ON instagram_rule_dm_log;
CREATE POLICY "service_role_manage_rule_dm_log" ON instagram_rule_dm_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rule_dm_log_rule_sender
  ON instagram_rule_dm_log (rule_id, sender_id);
