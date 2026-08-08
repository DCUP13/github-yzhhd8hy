-- Make SES credential columns nullable so the noreply-address upsert doesn't fail
-- when the owner hasn't entered SMTP credentials yet.
ALTER TABLE amazon_ses_settings ALTER COLUMN smtp_username DROP NOT NULL;
ALTER TABLE amazon_ses_settings ALTER COLUMN smtp_password DROP NOT NULL;
ALTER TABLE amazon_ses_settings ALTER COLUMN smtp_port DROP NOT NULL;
ALTER TABLE amazon_ses_settings ALTER COLUMN smtp_server DROP NOT NULL;

-- Replace the single "noreply_domain" concept with a full "noreply_address"
-- plus keep noreply_domain for backwards compatibility.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'amazon_ses_settings' AND column_name = 'noreply_address') THEN
    ALTER TABLE amazon_ses_settings ADD COLUMN noreply_address text;
  END IF;
END $$;

-- Add an autoresponder exemption list per user so designated addresses never trigger auto-replies.
CREATE TABLE IF NOT EXISTS autoresponder_exemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, email_address)
);
ALTER TABLE autoresponder_exemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exemptions_select_own" ON autoresponder_exemptions;
CREATE POLICY "exemptions_select_own"
  ON autoresponder_exemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "exemptions_insert_own" ON autoresponder_exemptions;
CREATE POLICY "exemptions_insert_own"
  ON autoresponder_exemptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "exemptions_delete_own" ON autoresponder_exemptions;
CREATE POLICY "exemptions_delete_own"
  ON autoresponder_exemptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Add routing address/domain to prompts so the autoresponder can select a prompt
-- based on the incoming email's destination address.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prompts' AND column_name = 'routing_addresses') THEN
    ALTER TABLE prompts ADD COLUMN routing_addresses text[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prompts' AND column_name = 'routing_domains') THEN
    ALTER TABLE prompts ADD COLUMN routing_domains text[] DEFAULT '{}';
  END IF;
END $$;

-- Extend shared_items to support 'prompt' type.
DROP POLICY IF EXISTS "users_select_visible_shared_items" ON shared_items;
ALTER TABLE shared_items DROP CONSTRAINT IF EXISTS shared_items_item_type_check;
ALTER TABLE shared_items ADD CONSTRAINT shared_items_item_type_check
  CHECK (item_type IN ('campaign', 'contact', 'template', 'prompt'));

CREATE POLICY "users_select_visible_shared_items"
  ON shared_items FOR SELECT TO authenticated
  USING (
    shared_with_type = 'all'
    OR shared_with_org_id = public.get_user_org_id()
  );

-- Owners can share prompts with any org; members/managers only with their own org.
DROP POLICY IF EXISTS "users_insert_own_shared_items" ON shared_items;
CREATE POLICY "users_insert_own_shared_items"
  ON shared_items FOR INSERT TO authenticated
  WITH CHECK (
    shared_by = auth.uid()
    AND (
      -- owners can share with any org
      (EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.user_id = auth.uid() AND om.role = 'owner' AND om.status = 'active'
      ) AND shared_with_type IN ('all', 'organization'))
      OR
      -- members/managers can only share within their own org
      (shared_with_type = 'organization' AND shared_with_org_id = public.get_user_org_id())
    )
  );

-- Add an index for prompt lookups by routing address/domain.
CREATE INDEX IF NOT EXISTS idx_prompts_routing ON prompts USING gin (routing_addresses, routing_domains);