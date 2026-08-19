-- Instagram AI autoresponder settings (per account)
CREATE TABLE instagram_autoresponder_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  prompt_id uuid REFERENCES prompts(id) ON DELETE SET NULL,
  cooldown_minutes integer NOT NULL DEFAULT 30,
  last_replied_recipient text,
  last_replied_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (account_id)
);

ALTER TABLE instagram_autoresponder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_autoresponder" ON instagram_autoresponder_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_autoresponder" ON instagram_autoresponder_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_autoresponder" ON instagram_autoresponder_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_autoresponder" ON instagram_autoresponder_settings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add a column to track whether a message was auto-replied by AI
ALTER TABLE instagram_webhook_events ADD COLUMN IF NOT EXISTS auto_replied boolean DEFAULT false;
