/*
# Add team management tables, columns, and RLS policies

## Purpose
Supports the upgraded Team page: organization domains, CRM custom fields,
member invitation with temporary passwords, and manager/owner access to
member email/domain/settings tables.

## New Tables

1. organization_domains
   - id (uuid PK)
   - organization_id (uuid FK → organizations)
   - domain (text, unique)
   - created_at (timestamptz)
   Purpose: domains registered to an organization for SES sending.

2. client_custom_fields
   - id (uuid PK)
   - org_id (uuid FK → organizations)
   - field_key (text)
   - field_label (text)
   - field_type (text: text/number/date/dropdown/boolean)
   - options (text[] nullable, for dropdowns)
   - sort_order (int, default 0)
   - created_at (timestamptz)
   Purpose: org-level custom field definitions for CRM contacts.

3. client_custom_values
   - id (uuid PK)
   - client_id (uuid)
   - org_id (uuid)
   - field_key (text)
   - value (text)
   - updated_at (timestamptz)
   Unique constraint on (client_id, field_key)
   Purpose: stores custom field values per contact.

4. user_custom_fields
   - id (uuid PK)
   - user_id (uuid FK → auth.users)
   - field_key (text)
   - field_label (text)
   - field_type (text)
   - options (text[] nullable)
   - sort_order (int, default 0)
   - created_at (timestamptz)
   Purpose: personal-level custom field definitions.

5. user_custom_values
   - id (uuid PK)
   - client_id (uuid)
   - user_id (uuid FK → auth.users)
   - field_key (text)
   - value (text)
   - updated_at (timestamptz)
   Unique constraint on (client_id, field_key)
   Purpose: personal custom field values per contact.

## Modified Tables

1. member_invitations — add temporary_password (text, nullable)
2. organizations — add allow_member_add_clients (bool default true),
   who_can_run_campaigns (text default 'managers')
3. organization_members — add invited_by (uuid, nullable, FK → auth.users)
4. amazon_ses_settings — add noreply_domain (text, nullable)

## Security (RLS)

All new tables get RLS enabled.

organization_domains: owners/managers of the org can CRUD.
client_custom_fields: org members can SELECT; owners/managers can INSERT/UPDATE/DELETE.
client_custom_values: org members can SELECT/INSERT/UPDATE/DELETE for their org.
user_custom_fields: each user can CRUD their own.
user_custom_values: each user can CRUD their own.

Additionally, manager/owner cross-member access policies are added to:
- amazon_ses_emails
- google_smtp_emails
- amazon_ses_domains
- user_settings
- amazon_ses_settings (owner-only read/update for noreply_domain)
*/

-- ──────────────────────────────────────────────────────────
-- 1. New tables
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (domain)
);

ALTER TABLE organization_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_domains_select" ON organization_domains;
CREATE POLICY "org_domains_select"
  ON organization_domains FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_domains.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_domains_insert" ON organization_domains;
CREATE POLICY "org_domains_insert"
  ON organization_domains FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_domains.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "org_domains_update" ON organization_domains;
CREATE POLICY "org_domains_update"
  ON organization_domains FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_domains.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_domains.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "org_domains_delete" ON organization_domains;
CREATE POLICY "org_domains_delete"
  ON organization_domains FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_domains.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'manager')
    )
  );

-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options text[],
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, field_key)
);

ALTER TABLE client_custom_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ccf_select" ON client_custom_fields;
CREATE POLICY "ccf_select"
  ON client_custom_fields FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = client_custom_fields.org_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ccf_insert" ON client_custom_fields;
CREATE POLICY "ccf_insert"
  ON client_custom_fields FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = client_custom_fields.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "ccf_update" ON client_custom_fields;
CREATE POLICY "ccf_update"
  ON client_custom_fields FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = client_custom_fields.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = client_custom_fields.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "ccf_delete" ON client_custom_fields;
CREATE POLICY "ccf_delete"
  ON client_custom_fields FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = client_custom_fields.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'manager')
    )
  );

-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_custom_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  org_id uuid NOT NULL,
  field_key text NOT NULL,
  value text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE (client_id, field_key)
);

ALTER TABLE client_custom_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ccv_select" ON client_custom_values;
CREATE POLICY "ccv_select"
  ON client_custom_values FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = client_custom_values.org_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ccv_insert" ON client_custom_values;
CREATE POLICY "ccv_insert"
  ON client_custom_values FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = client_custom_values.org_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ccv_update" ON client_custom_values;
CREATE POLICY "ccv_update"
  ON client_custom_values FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = client_custom_values.org_id
        AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = client_custom_values.org_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ccv_delete" ON client_custom_values;
CREATE POLICY "ccv_delete"
  ON client_custom_values FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = client_custom_values.org_id
        AND om.user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options text[],
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, field_key)
);

ALTER TABLE user_custom_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ucf_select" ON user_custom_fields;
CREATE POLICY "ucf_select"
  ON user_custom_fields FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ucf_insert" ON user_custom_fields;
CREATE POLICY "ucf_insert"
  ON user_custom_fields FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ucf_update" ON user_custom_fields;
CREATE POLICY "ucf_update"
  ON user_custom_fields FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ucf_delete" ON user_custom_fields;
CREATE POLICY "ucf_delete"
  ON user_custom_fields FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_custom_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  value text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE (client_id, field_key)
);

ALTER TABLE user_custom_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ucv_select" ON user_custom_values;
CREATE POLICY "ucv_select"
  ON user_custom_values FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ucv_insert" ON user_custom_values;
CREATE POLICY "ucv_insert"
  ON user_custom_values FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ucv_update" ON user_custom_values;
CREATE POLICY "ucv_update"
  ON user_custom_values FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ucv_delete" ON user_custom_values;
CREATE POLICY "ucv_delete"
  ON user_custom_values FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────
-- 2. Add columns to existing tables
-- ──────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_invitations' AND column_name = 'temporary_password') THEN
    ALTER TABLE member_invitations ADD COLUMN temporary_password text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'allow_member_add_clients') THEN
    ALTER TABLE organizations ADD COLUMN allow_member_add_clients boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'who_can_run_campaigns') THEN
    ALTER TABLE organizations ADD COLUMN who_can_run_campaigns text NOT NULL DEFAULT 'managers';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organization_members' AND column_name = 'invited_by') THEN
    ALTER TABLE organization_members ADD COLUMN invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'amazon_ses_settings' AND column_name = 'noreply_domain') THEN
    ALTER TABLE amazon_ses_settings ADD COLUMN noreply_domain text;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 3. Manager/owner cross-member RLS policies
-- These allow org owners and managers to manage tables that
-- belong to other users in their organization.
-- ──────────────────────────────────────────────────────────

-- amazon_ses_emails: owners/managers can manage for users in their org
DROP POLICY IF EXISTS "mgr_select_ses_emails" ON amazon_ses_emails;
CREATE POLICY "mgr_select_ses_emails"
  ON amazon_ses_emails FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = amazon_ses_emails.user_id
    )
  );

DROP POLICY IF EXISTS "mgr_insert_ses_emails" ON amazon_ses_emails;
CREATE POLICY "mgr_insert_ses_emails"
  ON amazon_ses_emails FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = amazon_ses_emails.user_id
    )
  );

DROP POLICY IF EXISTS "mgr_update_ses_emails" ON amazon_ses_emails;
CREATE POLICY "mgr_update_ses_emails"
  ON amazon_ses_emails FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = amazon_ses_emails.user_id
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = amazon_ses_emails.user_id
    )
  );

DROP POLICY IF EXISTS "mgr_delete_ses_emails" ON amazon_ses_emails;
CREATE POLICY "mgr_delete_ses_emails"
  ON amazon_ses_emails FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = amazon_ses_emails.user_id
    )
  );

-- google_smtp_emails: owners/managers can manage for users in their org
DROP POLICY IF EXISTS "mgr_select_google_emails" ON google_smtp_emails;
CREATE POLICY "mgr_select_google_emails"
  ON google_smtp_emails FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = google_smtp_emails.user_id
    )
  );

DROP POLICY IF EXISTS "mgr_insert_google_emails" ON google_smtp_emails;
CREATE POLICY "mgr_insert_google_emails"
  ON google_smtp_emails FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = google_smtp_emails.user_id
    )
  );

DROP POLICY IF EXISTS "mgr_update_google_emails" ON google_smtp_emails;
CREATE POLICY "mgr_update_google_emails"
  ON google_smtp_emails FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = google_smtp_emails.user_id
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = google_smtp_emails.user_id
    )
  );

DROP POLICY IF EXISTS "mgr_delete_google_emails" ON google_smtp_emails;
CREATE POLICY "mgr_delete_google_emails"
  ON google_smtp_emails FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = google_smtp_emails.user_id
    )
  );

-- amazon_ses_domains: owners/managers can manage for users in their org
DROP POLICY IF EXISTS "mgr_select_ses_domains" ON amazon_ses_domains;
CREATE POLICY "mgr_select_ses_domains"
  ON amazon_ses_domains FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = amazon_ses_domains.user_id
    )
  );

DROP POLICY IF EXISTS "mgr_insert_ses_domains" ON amazon_ses_domains;
CREATE POLICY "mgr_insert_ses_domains"
  ON amazon_ses_domains FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = amazon_ses_domains.user_id
    )
  );

DROP POLICY IF EXISTS "mgr_update_ses_domains" ON amazon_ses_domains;
CREATE POLICY "mgr_update_ses_domains"
  ON amazon_ses_domains FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = amazon_ses_domains.user_id
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = amazon_ses_domains.user_id
    )
  );

DROP POLICY IF EXISTS "mgr_delete_ses_domains" ON amazon_ses_domains;
CREATE POLICY "mgr_delete_ses_domains"
  ON amazon_ses_domains FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = amazon_ses_domains.user_id
    )
  );

-- user_settings: owners/managers can SELECT and UPDATE for users in their org
DROP POLICY IF EXISTS "mgr_select_user_settings" ON user_settings;
CREATE POLICY "mgr_select_user_settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = user_settings.user_id
    )
  );

DROP POLICY IF EXISTS "mgr_update_user_settings" ON user_settings;
CREATE POLICY "mgr_update_user_settings"
  ON user_settings FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = user_settings.user_id
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role IN ('owner', 'manager')
        AND om_target.user_id = user_settings.user_id
    )
  );

-- amazon_ses_settings: owners can SELECT and UPDATE for users in their org
DROP POLICY IF EXISTS "mgr_select_ses_settings" ON amazon_ses_settings;
CREATE POLICY "mgr_select_ses_settings"
  ON amazon_ses_settings FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role = 'owner'
        AND om_target.user_id = amazon_ses_settings.user_id
    )
  );

DROP POLICY IF EXISTS "mgr_update_ses_settings" ON amazon_ses_settings;
CREATE POLICY "mgr_update_ses_settings"
  ON amazon_ses_settings FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role = 'owner'
        AND om_target.user_id = amazon_ses_settings.user_id
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organization_members om_mgr
      JOIN organization_members om_target ON om_target.organization_id = om_mgr.organization_id
      WHERE om_mgr.user_id = auth.uid()
        AND om_mgr.role = 'owner'
        AND om_target.user_id = amazon_ses_settings.user_id
    )
  );

-- ──────────────────────────────────────────────────────────
-- 4. Indexes
-- ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_org_domains_org_id ON organization_domains(organization_id);
CREATE INDEX IF NOT EXISTS idx_ccf_org_id ON client_custom_fields(org_id);
CREATE INDEX IF NOT EXISTS idx_ccv_org_id ON client_custom_values(org_id);
CREATE INDEX IF NOT EXISTS idx_ccv_client_id ON client_custom_values(client_id);
CREATE INDEX IF NOT EXISTS idx_ucf_user_id ON user_custom_fields(user_id);
CREATE INDEX IF NOT EXISTS idx_ucv_user_id ON user_custom_values(user_id);
CREATE INDEX IF NOT EXISTS idx_ucv_client_id ON user_custom_values(client_id);
