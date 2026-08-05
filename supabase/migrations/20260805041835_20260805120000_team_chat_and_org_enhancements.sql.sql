/*
  # Team Chat, Member Invitations, and Organization Enhancements

  ## Overview
  This migration adds team chat functionality, a separate member_invitations table,
  organization profile fields, and supporting views/RPCs for the redesigned Team page.

  ## New Tables

  ### 1. `team_conversations`
  - 1:1 conversations between org members
  - `id` (uuid PK)
  - `organization_id` (uuid FK -> organizations)
  - `participant_1`, `participant_2` (uuid FK -> profiles, sorted so p1 < p2)
  - `last_message_at` (timestamptz, nullable)
  - `hidden_for_p1`, `hidden_for_p2` (boolean, default false) — soft-delete per side
  - `last_read_at_p1`, `last_read_at_p2` (timestamptz, nullable) — read receipts
  - `cleared_at_p1`, `cleared_at_p2` (timestamptz, nullable) — message cutoff per side
  - Unique constraint on (participant_1, participant_2)

  ### 2. `team_messages`
  - Messages within a conversation
  - `id` (uuid PK)
  - `conversation_id` (uuid FK -> team_conversations, cascade delete)
  - `sender_id` (uuid FK -> profiles)
  - `body` (text, not null)
  - `created_at` (timestamptz, default now())

  ### 3. `member_invitations`
  - Separate from the legacy `invitations` table; used by the new Team page UI
  - `id` (uuid PK)
  - `organization_id` (uuid FK -> organizations, cascade delete)
  - `email` (text, not null)
  - `role` (text, default 'member') — 'member' | 'manager'
  - `status` (text, default 'pending') — 'pending' | 'accepted' | 'revoked'
  - `invited_by` (uuid FK -> profiles)
  - `expires_at` (timestamptz, not null)
  - `created_at` (timestamptz, default now())

  ## Modified Tables
  - `organizations`: added `description`, `logo_url`, `industry`, `company_size`, `website`, `location`, `owner_id` columns

  ## New Views
  - `organization_members_with_emails`: joins `organization_members` with `profiles` to expose email and name

  ## New RPCs
  - `mark_conversation_read(conv_id uuid)`: updates last_read_at for the current user's side
  - `change_member_role(p_member_id uuid, p_new_role text)`: changes a member's role (owner only)

  ## Security (RLS)
  - `team_conversations`: users can SELECT/INSERT/UPDATE only conversations they participate in
  - `team_messages`: users can SELECT messages in conversations they participate in; can INSERT messages in their own conversations
  - `member_invitations`: org managers/owners can SELECT; super_admin full access
  - Views run as invoker with RLS on underlying tables
*/

-- ============================================================
-- Step 1: Add columns to organizations
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'description') THEN
    ALTER TABLE organizations ADD COLUMN description text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'logo_url') THEN
    ALTER TABLE organizations ADD COLUMN logo_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'industry') THEN
    ALTER TABLE organizations ADD COLUMN industry text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'company_size') THEN
    ALTER TABLE organizations ADD COLUMN company_size text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'website') THEN
    ALTER TABLE organizations ADD COLUMN website text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'location') THEN
    ALTER TABLE organizations ADD COLUMN location text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'owner_id') THEN
    ALTER TABLE organizations ADD COLUMN owner_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Allow authenticated users to INSERT into organizations (for create-org flow)
DROP POLICY IF EXISTS "members_insert_own_org" ON organizations;
CREATE POLICY "members_insert_own_org"
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow org managers/owners to UPDATE their org
DROP POLICY IF EXISTS "members_update_own_org" ON organizations;
CREATE POLICY "members_update_own_org"
  ON organizations FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'
    )
  );

-- Allow members to INSERT their own membership (for create-org flow)
DROP POLICY IF EXISTS "members_insert_own_membership" ON organization_members;
CREATE POLICY "members_insert_own_membership"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow org managers/owners to INSERT other members
DROP POLICY IF EXISTS "managers_insert_members" ON organization_members;
CREATE POLICY "managers_insert_members"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members om2
      WHERE om2.user_id = auth.uid() AND om2.role IN ('owner', 'manager') AND om2.status = 'active'
    )
  );

-- Allow org managers/owners to DELETE members
DROP POLICY IF EXISTS "managers_delete_members" ON organization_members;
CREATE POLICY "managers_delete_members"
  ON organization_members FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members om2
      WHERE om2.user_id = auth.uid() AND om2.role IN ('owner', 'manager') AND om2.status = 'active'
    )
  );

-- Allow org managers/owners to UPDATE member roles
DROP POLICY IF EXISTS "managers_update_members" ON organization_members;
CREATE POLICY "managers_update_members"
  ON organization_members FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members om2
      WHERE om2.user_id = auth.uid() AND om2.role IN ('owner', 'manager') AND om2.status = 'active'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members om2
      WHERE om2.user_id = auth.uid() AND om2.role IN ('owner', 'manager') AND om2.status = 'active'
    )
  );

-- ============================================================
-- Step 2: Create team_conversations table
-- ============================================================

CREATE TABLE IF NOT EXISTS team_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  participant_1 uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  participant_2 uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  hidden_for_p1 boolean NOT NULL DEFAULT false,
  hidden_for_p2 boolean NOT NULL DEFAULT false,
  last_read_at_p1 timestamptz,
  last_read_at_p2 timestamptz,
  cleared_at_p1 timestamptz,
  cleared_at_p2 timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (participant_1, participant_2),
  CHECK (participant_1 < participant_2)
);

CREATE INDEX IF NOT EXISTS idx_team_conversations_org ON team_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_team_conversations_p1 ON team_conversations(participant_1);
CREATE INDEX IF NOT EXISTS idx_team_conversations_p2 ON team_conversations(participant_2);

ALTER TABLE team_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_conversations" ON team_conversations;
CREATE POLICY "select_own_conversations"
  ON team_conversations FOR SELECT
  TO authenticated
  USING (participant_1 = auth.uid() OR participant_2 = auth.uid());

DROP POLICY IF EXISTS "insert_own_conversations" ON team_conversations;
CREATE POLICY "insert_own_conversations"
  ON team_conversations FOR INSERT
  TO authenticated
  WITH CHECK (participant_1 = auth.uid() OR participant_2 = auth.uid());

DROP POLICY IF EXISTS "update_own_conversations" ON team_conversations;
CREATE POLICY "update_own_conversations"
  ON team_conversations FOR UPDATE
  TO authenticated
  USING (participant_1 = auth.uid() OR participant_2 = auth.uid())
  WITH CHECK (participant_1 = auth.uid() OR participant_2 = auth.uid());

-- ============================================================
-- Step 3: Create team_messages table
-- ============================================================

CREATE TABLE IF NOT EXISTS team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES team_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_messages_conv ON team_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_created ON team_messages(conversation_id, created_at);

ALTER TABLE team_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_messages" ON team_messages;
CREATE POLICY "select_own_messages"
  ON team_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_conversations
      WHERE team_conversations.id = team_messages.conversation_id
      AND (team_conversations.participant_1 = auth.uid() OR team_conversations.participant_2 = auth.uid())
    )
  );

DROP POLICY IF EXISTS "insert_own_messages" ON team_messages;
CREATE POLICY "insert_own_messages"
  ON team_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_conversations
      WHERE team_conversations.id = team_messages.conversation_id
      AND (team_conversations.participant_1 = auth.uid() OR team_conversations.participant_2 = auth.uid())
    )
  );

-- ============================================================
-- Step 4: Create member_invitations table
-- ============================================================

CREATE TABLE IF NOT EXISTS member_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'manager')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_invitations_org ON member_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_member_invitations_email ON member_invitations(email);

ALTER TABLE member_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_member_invitations" ON member_invitations;
CREATE POLICY "super_admin_all_member_invitations"
  ON member_invitations FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "managers_select_member_invitations" ON member_invitations;
CREATE POLICY "managers_select_member_invitations"
  ON member_invitations FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "managers_insert_member_invitations" ON member_invitations;
CREATE POLICY "managers_insert_member_invitations"
  ON member_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "managers_delete_member_invitations" ON member_invitations;
CREATE POLICY "managers_delete_member_invitations"
  ON member_invitations FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'
    )
  );

-- ============================================================
-- Step 5: Create organization_members_with_emails view
-- ============================================================

CREATE OR REPLACE VIEW organization_members_with_emails AS
SELECT
  om.id,
  om.organization_id,
  om.user_id,
  p.email,
  COALESCE(p.name, p.email) AS name,
  om.role,
  om.status,
  om.created_at AS joined_at
FROM organization_members om
JOIN profiles p ON p.id = om.user_id;

ALTER VIEW organization_members_with_emails SET (security_invoker = true, security_barrier = true);

-- ============================================================
-- Step 6: RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_conversation_read(conv_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE team_conversations
  SET last_read_at_p1 = CASE WHEN participant_1 = auth.uid() THEN now() ELSE last_read_at_p1 END,
      last_read_at_p2 = CASE WHEN participant_2 = auth.uid() THEN now() ELSE last_read_at_p2 END
  WHERE id = conv_id
  AND (participant_1 = auth.uid() OR participant_2 = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.change_member_role(p_member_id uuid, p_new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_current_role text;
  v_requester_role text;
BEGIN
  SELECT organization_id, role INTO v_org_id, v_current_role
  FROM organization_members WHERE id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF p_new_role NOT IN ('member', 'manager') THEN
    RAISE EXCEPTION 'Invalid role. Must be member or manager.';
  END IF;

  IF v_current_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot change the role of an owner';
  END IF;

  IF NOT public.is_super_admin() THEN
    SELECT role INTO v_requester_role
    FROM organization_members
    WHERE organization_id = v_org_id AND user_id = auth.uid() AND status = 'active';

    IF v_requester_role IS NULL OR v_requester_role != 'owner' THEN
      RAISE EXCEPTION 'Only the organization owner can change member roles';
    END IF;
  END IF;

  UPDATE organization_members SET role = p_new_role WHERE id = p_member_id;
END;
$$;
