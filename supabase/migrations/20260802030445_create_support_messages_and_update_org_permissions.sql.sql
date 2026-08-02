/*
# Create Support Messages System and Update Organization Permissions

## Overview
This migration creates a realtime support messaging system between the platform
owner and all users, and between managers and members within the same organization.
It also expands RLS policies so the owner can view/edit all member settings, and
managers can view their members' settings. Finally, it adds a helper function
to look up a user's org role.

## New Tables

### 1. `support_messages`
- `id` (uuid, primary key)
- `sender_id` (uuid, references profiles, cascade delete) — who sent the message
- `recipient_id` (uuid, references profiles, cascade delete) — who receives the message
- `organization_id` (uuid, references organizations, cascade delete, nullable) — org context
- `body` (text, not null) — message content
- `read_at` (timestamptz, nullable) — when the recipient read the message
- `created_at` (timestamptz, default now())

## New Functions
- `get_user_org_role()` — returns the current user's role within their organization
  ('owner', 'manager', 'member', or null)

## Modified Policies
- `user_settings`: Owner can SELECT/INSERT/UPDATE all rows; managers can SELECT rows for
  members in their own org.
- `amazon_ses_domains`: Owner can SELECT/INSERT/UPDATE/DELETE all rows; managers
  can SELECT rows for members in their own org.
- `amazon_ses_emails`: Owner can SELECT/INSERT/UPDATE/DELETE all rows; managers
  can SELECT rows for members in their own org.
- `google_smtp_emails`: Owner can SELECT/INSERT/UPDATE/DELETE all rows; managers
  can SELECT rows for members in their own org.
- `profiles`: Owner can SELECT all profiles; managers can SELECT profiles of
  members in their own org.

## Security (RLS) — support_messages
- Owner (super_admin) can SELECT, INSERT, UPDATE all messages
- Any authenticated user can INSERT messages where they are the sender
- Any authenticated user can SELECT messages where they are sender or recipient
- Any authenticated user can UPDATE (mark read) messages where they are the recipient
- Realtime is enabled on this table

## Important Notes
1. The owner (super_admin) can see and participate in every conversation.
2. Managers can message members in their own org and the owner.
3. Members can message the owner and their org's managers.
4. Messages are realtime-enabled so they appear instantly without refresh.
*/

-- ============================================================
-- Step 1: Helper function to get the current user's org role
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_org_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role
  FROM public.organization_members
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

-- ============================================================
-- Step 2: Create support_messages table
-- ============================================================

CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_sender ON support_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_recipient ON support_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created ON support_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_support_messages_org ON support_messages(organization_id);

-- Enable realtime
ALTER TABLE support_messages REPLICA IDENTITY FULL;

-- ============================================================
-- Step 3: RLS for support_messages
-- ============================================================

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Owner can do everything
DROP POLICY IF EXISTS "super_admin_all_support_messages" ON support_messages;
CREATE POLICY "super_admin_all_support_messages"
  ON support_messages FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Users can see messages where they are sender or recipient
DROP POLICY IF EXISTS "users_select_own_support_messages" ON support_messages;
CREATE POLICY "users_select_own_support_messages"
  ON support_messages FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Users can send messages where they are the sender
DROP POLICY IF EXISTS "users_insert_own_support_messages" ON support_messages;
CREATE POLICY "users_insert_own_support_messages"
  ON support_messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- Users can mark messages they received as read
DROP POLICY IF EXISTS "users_update_own_support_messages" ON support_messages;
CREATE POLICY "users_update_own_support_messages"
  ON support_messages FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ============================================================
-- Step 4: Expand profiles RLS — owner sees all, manager sees org members
-- ============================================================

-- Add: super_admin can read all profiles
DROP POLICY IF EXISTS "super_admin_read_all_profiles" ON profiles;
CREATE POLICY "super_admin_read_all_profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- Add: managers can read profiles of members in their own org
DROP POLICY IF EXISTS "managers_read_org_member_profiles" ON profiles;
CREATE POLICY "managers_read_org_member_profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    public.get_user_org_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = profiles.id
        AND om.status = 'active'
        AND om.organization_id = public.get_user_org_id()
    )
  );

-- ============================================================
-- Step 5: Expand user_settings RLS — owner edits all, manager reads org members
-- ============================================================

-- Owner can read all user_settings
DROP POLICY IF EXISTS "super_admin_read_all_user_settings" ON user_settings;
CREATE POLICY "super_admin_read_all_user_settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- Owner can update all user_settings
DROP POLICY IF EXISTS "super_admin_update_all_user_settings" ON user_settings;
CREATE POLICY "super_admin_update_all_user_settings"
  ON user_settings FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Owner can insert user_settings for any member
DROP POLICY IF EXISTS "super_admin_insert_all_user_settings" ON user_settings;
CREATE POLICY "super_admin_insert_all_user_settings"
  ON user_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

-- Managers can read settings for members in their own org
DROP POLICY IF EXISTS "managers_read_org_member_settings" ON user_settings;
CREATE POLICY "managers_read_org_member_settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (
    public.get_user_org_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = user_settings.user_id
        AND om.status = 'active'
        AND om.organization_id = public.get_user_org_id()
    )
  );

-- ============================================================
-- Step 6: Expand amazon_ses_domains RLS — owner all, manager reads org members
-- ============================================================

DROP POLICY IF EXISTS "super_admin_all_ses_domains" ON amazon_ses_domains;
CREATE POLICY "super_admin_all_ses_domains"
  ON amazon_ses_domains FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "managers_read_org_ses_domains" ON amazon_ses_domains;
CREATE POLICY "managers_read_org_ses_domains"
  ON amazon_ses_domains FOR SELECT
  TO authenticated
  USING (
    public.get_user_org_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = amazon_ses_domains.user_id
        AND om.status = 'active'
        AND om.organization_id = public.get_user_org_id()
    )
  );

-- ============================================================
-- Step 7: Expand amazon_ses_emails RLS — owner all, manager reads org members
-- ============================================================

DROP POLICY IF EXISTS "super_admin_all_ses_emails" ON amazon_ses_emails;
CREATE POLICY "super_admin_all_ses_emails"
  ON amazon_ses_emails FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "managers_read_org_ses_emails" ON amazon_ses_emails;
CREATE POLICY "managers_read_org_ses_emails"
  ON amazon_ses_emails FOR SELECT
  TO authenticated
  USING (
    public.get_user_org_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = amazon_ses_emails.user_id
        AND om.status = 'active'
        AND om.organization_id = public.get_user_org_id()
    )
  );

-- ============================================================
-- Step 8: Expand google_smtp_emails RLS — owner all, manager reads org members
-- ============================================================

DROP POLICY IF EXISTS "super_admin_all_google_emails" ON google_smtp_emails;
CREATE POLICY "super_admin_all_google_emails"
  ON google_smtp_emails FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "managers_read_org_google_emails" ON google_smtp_emails;
CREATE POLICY "managers_read_org_google_emails"
  ON google_smtp_emails FOR SELECT
  TO authenticated
  USING (
    public.get_user_org_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = google_smtp_emails.user_id
        AND om.status = 'active'
        AND om.organization_id = public.get_user_org_id()
    )
  );

-- ============================================================
-- Step 9: Enable realtime publication for support_messages
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
END $$;