/*
  # Create Organizations, Team Members, and Invitations System

  ## Overview
  This migration establishes the organization-based team management system.
  The platform owner (devoncadvertising@gmail.com) creates organizations and
  invites people by email, assigning them roles of manager or member.
  Self-serve signup is disabled — the only way to get an account is through
  an invitation from the platform owner.

  ## New Tables

  ### 1. `organizations`
  - `id` (uuid, primary key)
  - `name` (text, not null) — the organization name
  - `created_by` (uuid, references profiles) — who created the org
  - `created_at` (timestamptz)

  ### 2. `organization_members`
  - `id` (uuid, primary key)
  - `organization_id` (uuid, references organizations, cascade delete)
  - `user_id` (uuid, references profiles, cascade delete)
  - `role` (text, not null) — 'owner' | 'manager' | 'member'
  - `status` (text, not null, default 'active') — 'pending' | 'active'
  - `created_at` (timestamptz)
  - Unique constraint on (organization_id, user_id)

  ### 3. `invitations`
  - `id` (uuid, primary key)
  - `organization_id` (uuid, references organizations, cascade delete)
  - `email` (text, not null)
  - `role` (text, not null) — 'manager' | 'member'
  - `token` (text, unique, not null)
  - `status` (text, not null, default 'pending') — 'pending' | 'accepted' | 'revoked'
  - `invited_by` (uuid, references profiles)
  - `expires_at` (timestamptz, not null)
  - `accepted_at` (timestamptz, nullable)
  - `created_at` (timestamptz)

  ## Modified Tables
  - `profiles`: added `role` column (text, default 'user') — 'super_admin' | 'user'

  ## Helper Functions
  - `is_super_admin()` — returns true if current user's profile role is 'super_admin'
  - `get_user_org_id()` — returns the organization_id for the current user

  ## Security (RLS)
  - `organizations`: Super_admin can do everything. Org members can SELECT their own org.
  - `organization_members`: Super_admin can do everything. Users can SELECT their own org's members.
  - `invitations`: Super_admin can do everything. Users can SELECT their own org's invitations.
*/

-- ============================================================
-- Step 1: Add role column to profiles and set platform owner
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles ADD COLUMN role text NOT NULL DEFAULT 'user';
  END IF;
END $$;

UPDATE profiles SET role = 'super_admin' WHERE email = 'devoncadvertising@gmail.com';

-- ============================================================
-- Step 2: Create tables (before RLS and functions)
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'member')),
  token text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_organization ON invitations(organization_id);

-- ============================================================
-- Step 3: Helper functions (tables now exist)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

-- ============================================================
-- Step 4: Enable RLS and add policies
-- ============================================================

-- --- organizations ---
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_organizations" ON organizations;
CREATE POLICY "super_admin_all_organizations"
  ON organizations FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "members_select_own_org" ON organizations;
CREATE POLICY "members_select_own_org"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- --- organization_members ---
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_members" ON organization_members;
CREATE POLICY "super_admin_all_members"
  ON organization_members FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "members_select_own_org_members" ON organization_members;
CREATE POLICY "members_select_own_org_members"
  ON organization_members FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "users_select_own_membership" ON organization_members;
CREATE POLICY "users_select_own_membership"
  ON organization_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- --- invitations ---
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_invitations" ON invitations;
CREATE POLICY "super_admin_all_invitations"
  ON invitations FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "members_select_own_org_invitations" ON invitations;
CREATE POLICY "members_select_own_org_invitations"
  ON invitations FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_org_id());