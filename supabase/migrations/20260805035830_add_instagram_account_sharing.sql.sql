/*
# Instagram Account Sharing & Collaboration

## Purpose
Allows an Instagram account owner to share their connected Instagram account
with selected organization teammates. Shared teammates can view incoming
events, collaborate on replies, and work on posts/drafts together. Access
can be revoked at any time by the account owner or an organization manager.

## New Tables

### 1. instagram_account_shares
- id (uuid PK)
- account_id (uuid, references instagram_accounts, cascade delete) — the shared account
- shared_with_user_id (uuid, references auth.users, cascade delete) — the teammate gaining access
- shared_by_user_id (uuid, references auth.users, cascade delete) — who granted access
- organization_id (uuid, references organizations, cascade delete) — the org context
- permissions (jsonb, default '{"view": true}') — granular perms: view, reply, post
- created_at (timestamptz)
- UNIQUE (account_id, shared_with_user_id) — one share per account per user

## Security
- RLS enabled on instagram_account_shares.
- The Instagram account owner can manage shares for their own accounts.
- Organization managers can manage shares for accounts owned by members of their org.
- Any shared user can read their own share rows.
- The account owner can always read their own account's shares.
- Added SELECT policy so that a user who has been shared an Instagram account
  can also SELECT the instagram_accounts row (read-only) and read
  instagram_webhook_events / instagram_posts / instagram_auto_rules for that
  shared account. These are added as additional SELECT policies that check
  for either ownership OR an active share.

## Notes
1. Only the account owner or an org manager may create/revoke a share.
2. Revoking a share removes the row; the teammate immediately loses access.
3. The `permissions` jsonb supports keys: view, reply, post. Defaults to view-only.
*/

-- 1. Create shares table
CREATE TABLE IF NOT EXISTS instagram_account_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  permissions jsonb NOT NULL DEFAULT '{"view": true}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE (account_id, shared_with_user_id)
);

ALTER TABLE instagram_account_shares ENABLE ROW LEVEL SECURITY;

-- Helper: check if the current user is the owner of an instagram account
CREATE OR REPLACE FUNCTION public.is_ig_account_owner(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.instagram_accounts
    WHERE id = p_account_id AND user_id = auth.uid()
  );
$$;

-- Helper: check if the current user has been shared a given instagram account
CREATE OR REPLACE FUNCTION public.has_ig_share(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.instagram_account_shares
    WHERE account_id = p_account_id AND shared_with_user_id = auth.uid()
  );
$$;

-- Helper: check if the current user is a manager of the org that the account owner belongs to
CREATE OR REPLACE FUNCTION public.is_manager_for_ig_account(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.instagram_accounts ia
    JOIN public.organization_members owner_mem
      ON owner_mem.user_id = ia.user_id AND owner_mem.status = 'active'
    JOIN public.organization_members mgr_mem
      ON mgr_mem.organization_id = owner_mem.organization_id
      AND mgr_mem.user_id = auth.uid()
      AND mgr_mem.status = 'active'
      AND mgr_mem.role IN ('manager', 'owner')
    WHERE ia.id = p_account_id
  );
$$;

-- Shares table policies
DROP POLICY IF EXISTS "select_ig_shares" ON instagram_account_shares;
CREATE POLICY "select_ig_shares"
  ON instagram_account_shares FOR SELECT
  TO authenticated
  USING (
    shared_with_user_id = auth.uid()
    OR shared_by_user_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_manager_for_ig_account(account_id)
  );

DROP POLICY IF EXISTS "insert_ig_shares" ON instagram_account_shares;
CREATE POLICY "insert_ig_shares"
  ON instagram_account_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_ig_account_owner(account_id)
    OR public.is_super_admin()
    OR public.is_manager_for_ig_account(account_id)
  );

DROP POLICY IF EXISTS "delete_ig_shares" ON instagram_account_shares;
CREATE POLICY "delete_ig_shares"
  ON instagram_account_shares FOR DELETE
  TO authenticated
  USING (
    shared_with_user_id = auth.uid()
    OR shared_by_user_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_manager_for_ig_account(account_id)
  );

DROP POLICY IF EXISTS "update_ig_shares" ON instagram_account_shares;
CREATE POLICY "update_ig_shares"
  ON instagram_account_shares FOR UPDATE
  TO authenticated
  USING (
    shared_by_user_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_manager_for_ig_account(account_id)
  )
  WITH CHECK (
    shared_by_user_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_manager_for_ig_account(account_id)
  );

-- 2. Add SELECT policies on instagram_accounts so shared users can read shared accounts
DROP POLICY IF EXISTS "select_shared_ig_accounts" ON instagram_accounts;
CREATE POLICY "select_shared_ig_accounts"
  ON instagram_accounts FOR SELECT
  TO authenticated
  USING (public.has_ig_share(id));

-- 3. Add SELECT policies on instagram_webhook_events for shared accounts
DROP POLICY IF EXISTS "select_shared_ig_webhook_events" ON instagram_webhook_events;
CREATE POLICY "select_shared_ig_webhook_events"
  ON instagram_webhook_events FOR SELECT
  TO authenticated
  USING (public.has_ig_share(
    (SELECT id FROM public.instagram_accounts WHERE instagram_accounts.user_id = instagram_webhook_events.user_id)
  ));

-- 4. Add SELECT policies on instagram_posts for shared accounts
DROP POLICY IF EXISTS "select_shared_ig_posts" ON instagram_posts;
CREATE POLICY "select_shared_ig_posts"
  ON instagram_posts FOR SELECT
  TO authenticated
  USING (public.has_ig_share(
    (SELECT id FROM public.instagram_accounts WHERE instagram_accounts.user_id = instagram_posts.user_id)
  ));

-- 5. Add SELECT policies on instagram_auto_rules for shared accounts
DROP POLICY IF EXISTS "select_shared_ig_auto_rules" ON instagram_auto_rules;
CREATE POLICY "select_shared_ig_auto_rules"
  ON instagram_auto_rules FOR SELECT
  TO authenticated
  USING (public.has_ig_share(
    (SELECT id FROM public.instagram_accounts WHERE instagram_accounts.user_id = instagram_auto_rules.user_id)
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ig_shares_account ON instagram_account_shares(account_id);
CREATE INDEX IF NOT EXISTS idx_ig_shares_shared_with ON instagram_account_shares(shared_with_user_id);
