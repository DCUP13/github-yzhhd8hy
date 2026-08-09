/*
# Prevent managers from viewing or editing owner's settings

## Problem
The existing manager policies on user_settings, amazon_ses_emails, and
amazon_ses_domains allowed any user with role 'owner' OR 'manager' to read
and modify ANY org member's data — including the owner's. This meant a
manager could see and change the owner's personal settings, email accounts,
and domains.

## Fix
Replace the three manager policies (select/update/delete on each table) so
the target member must NOT be an owner. The manager can still manage regular
members and other managers, but the owner's data is off-limits to non-owners.

## Tables affected
- user_settings: mgr_select_user_settings, mgr_update_user_settings
- amazon_ses_emails: mgr_select_ses_emails, mgr_update_ses_emails, mgr_delete_ses_emails
- amazon_ses_domains: mgr_select_ses_domains, mgr_update_ses_domains, mgr_delete_ses_domains

## Security
- Managers (role = 'manager') can still SELECT/UPDATE/DELETE for non-owner
  org members.
- Owners (role = 'owner') retain full access to all org members (unchanged).
- The owner's own self-access policies (auth.uid() = user_id) are untouched.
*/

-- user_settings: SELECT
DROP POLICY IF EXISTS "mgr_select_user_settings" ON user_settings;
CREATE POLICY "mgr_select_user_settings"
ON user_settings FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM organization_members om_mgr
    JOIN organization_members om_target
      ON om_target.organization_id = om_mgr.organization_id
    WHERE om_mgr.user_id = auth.uid()
      AND om_mgr.role = ANY (ARRAY['owner', 'manager'])
      AND om_target.user_id = user_settings.user_id
      AND om_target.role != 'owner'
  )
);

-- user_settings: UPDATE
DROP POLICY IF EXISTS "mgr_update_user_settings" ON user_settings;
CREATE POLICY "mgr_update_user_settings"
ON user_settings FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM organization_members om_mgr
    JOIN organization_members om_target
      ON om_target.organization_id = om_mgr.organization_id
    WHERE om_mgr.user_id = auth.uid()
      AND om_mgr.role = ANY (ARRAY['owner', 'manager'])
      AND om_target.user_id = user_settings.user_id
      AND om_target.role != 'owner'
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM organization_members om_mgr
    JOIN organization_members om_target
      ON om_target.organization_id = om_mgr.organization_id
    WHERE om_mgr.user_id = auth.uid()
      AND om_mgr.role = ANY (ARRAY['owner', 'manager'])
      AND om_target.user_id = user_settings.user_id
      AND om_target.role != 'owner'
  )
);

-- amazon_ses_emails: SELECT
DROP POLICY IF EXISTS "mgr_select_ses_emails" ON amazon_ses_emails;
CREATE POLICY "mgr_select_ses_emails"
ON amazon_ses_emails FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM organization_members om_mgr
    JOIN organization_members om_target
      ON om_target.organization_id = om_mgr.organization_id
    WHERE om_mgr.user_id = auth.uid()
      AND om_mgr.role = ANY (ARRAY['owner', 'manager'])
      AND om_target.user_id = amazon_ses_emails.user_id
      AND om_target.role != 'owner'
  )
);

-- amazon_ses_emails: UPDATE
DROP POLICY IF EXISTS "mgr_update_ses_emails" ON amazon_ses_emails;
CREATE POLICY "mgr_update_ses_emails"
ON amazon_ses_emails FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM organization_members om_mgr
    JOIN organization_members om_target
      ON om_target.organization_id = om_mgr.organization_id
    WHERE om_mgr.user_id = auth.uid()
      AND om_mgr.role = ANY (ARRAY['owner', 'manager'])
      AND om_target.user_id = amazon_ses_emails.user_id
      AND om_target.role != 'owner'
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM organization_members om_mgr
    JOIN organization_members om_target
      ON om_target.organization_id = om_mgr.organization_id
    WHERE om_mgr.user_id = auth.uid()
      AND om_mgr.role = ANY (ARRAY['owner', 'manager'])
      AND om_target.user_id = amazon_ses_emails.user_id
      AND om_target.role != 'owner'
  )
);

-- amazon_ses_emails: DELETE
DROP POLICY IF EXISTS "mgr_delete_ses_emails" ON amazon_ses_emails;
CREATE POLICY "mgr_delete_ses_emails"
ON amazon_ses_emails FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM organization_members om_mgr
    JOIN organization_members om_target
      ON om_target.organization_id = om_mgr.organization_id
    WHERE om_mgr.user_id = auth.uid()
      AND om_mgr.role = ANY (ARRAY['owner', 'manager'])
      AND om_target.user_id = amazon_ses_emails.user_id
      AND om_target.role != 'owner'
  )
);

-- amazon_ses_domains: SELECT
DROP POLICY IF EXISTS "mgr_select_ses_domains" ON amazon_ses_domains;
CREATE POLICY "mgr_select_ses_domains"
ON amazon_ses_domains FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM organization_members om_mgr
    JOIN organization_members om_target
      ON om_target.organization_id = om_mgr.organization_id
    WHERE om_mgr.user_id = auth.uid()
      AND om_mgr.role = ANY (ARRAY['owner', 'manager'])
      AND om_target.user_id = amazon_ses_domains.user_id
      AND om_target.role != 'owner'
  )
);

-- amazon_ses_domains: UPDATE
DROP POLICY IF EXISTS "mgr_update_ses_domains" ON amazon_ses_domains;
CREATE POLICY "mgr_update_ses_domains"
ON amazon_ses_domains FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM organization_members om_mgr
    JOIN organization_members om_target
      ON om_target.organization_id = om_mgr.organization_id
    WHERE om_mgr.user_id = auth.uid()
      AND om_mgr.role = ANY (ARRAY['owner', 'manager'])
      AND om_target.user_id = amazon_ses_domains.user_id
      AND om_target.role != 'owner'
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM organization_members om_mgr
    JOIN organization_members om_target
      ON om_target.organization_id = om_mgr.organization_id
    WHERE om_mgr.user_id = auth.uid()
      AND om_mgr.role = ANY (ARRAY['owner', 'manager'])
      AND om_target.user_id = amazon_ses_domains.user_id
      AND om_target.role != 'owner'
  )
);

-- amazon_ses_domains: DELETE
DROP POLICY IF EXISTS "mgr_delete_ses_domains" ON amazon_ses_domains;
CREATE POLICY "mgr_delete_ses_domains"
ON amazon_ses_domains FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM organization_members om_mgr
    JOIN organization_members om_target
      ON om_target.organization_id = om_mgr.organization_id
    WHERE om_mgr.user_id = auth.uid()
      AND om_mgr.role = ANY (ARRAY['owner', 'manager'])
      AND om_target.user_id = amazon_ses_domains.user_id
      AND om_target.role != 'owner'
  )
);
