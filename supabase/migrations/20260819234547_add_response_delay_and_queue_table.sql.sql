-- Replace cooldown_minutes with response_delay_seconds
ALTER TABLE instagram_autoresponder_settings
  ADD COLUMN IF NOT EXISTS response_delay_seconds integer NOT NULL DEFAULT 15;

-- Backfill from old cooldown_minutes (convert to seconds, cap at 120)
UPDATE instagram_autoresponder_settings
  SET response_delay_seconds = LEAST(cooldown_minutes * 60, 120)
  WHERE response_delay_seconds = 15 AND cooldown_minutes IS NOT NULL;

-- Queue table for pending autoresponder responses (one per conversation)
CREATE TABLE IF NOT EXISTS instagram_response_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  recipient_id text NOT NULL,
  trigger_event_id uuid REFERENCES instagram_webhook_events(id) ON DELETE CASCADE,
  fire_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE instagram_response_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_response_queue" ON instagram_response_queue
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_response_queue" ON instagram_response_queue
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_response_queue" ON instagram_response_queue
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_response_queue" ON instagram_response_queue
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "service_role_manage_response_queue" ON instagram_response_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_response_queue_fire ON instagram_response_queue(status, fire_at);
CREATE INDEX IF NOT EXISTS idx_response_queue_recipient ON instagram_response_queue(account_id, recipient_id, status);
