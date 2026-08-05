/*
# Add feature_flags column to profiles

## Purpose
Introduces a per-user feature flag system so the platform owner can selectively
enable/disable features (Instagram, and future integrations like LinkedIn) for
each invited member. The owner (super_admin) always has access to everything.

## Changes

### 1. New column on `profiles`
- `feature_flags` (jsonb, NOT NULL, default '{}')
  Stores a JSON object of feature toggle states, e.g. `{"instagram": true, "linkedin": false}`.
  An empty object `{}` means no optional features are enabled (owner is exempt —
  see the `has_feature_enabled` helper below).

### 2. SECURITY DEFINER function: `set_user_feature_flags`
- Allows the platform owner (super_admin) to set feature flags for any user.
- Also allows an organization manager to set flags for members of their own org.
- Derives the caller from `auth.uid()` — never trusts a caller-supplied actor.
- Revoked from `anon` so only authenticated users can call it.

### 3. SECURITY DEFINER helper: `has_feature_enabled`
- Returns true if a given feature key is enabled for the calling user.
- super_admin always returns true (full access).
- Otherwise checks `feature_flags->key` for a boolean true.
- Used by frontend RPC calls to gate feature visibility.

### 4. Column-level security
- `feature_flags` is a privileged column. We REVOKE UPDATE on it from
  `authenticated` and do NOT grant it back, so users cannot flip their own
  flags via the data API. All changes go through `set_user_feature_flags`.

## Security
- No new tables. RLS already enabled on `profiles`.
- `feature_flags` column is not client-writable (revoked UPDATE).
- Both functions are SECURITY DEFINER with SET search_path = public.
- `set_user_feature_flags` revokes EXECUTE from anon.
- `has_feature_enabled` is callable by authenticated (read-only check).

## Notes
1. Existing profiles get `feature_flags = '{}'::jsonb` via the column default.
2. The owner (super_admin) is always treated as having every feature enabled,
   regardless of the value in their `feature_flags` column.
*/

-- 1. Add the column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'feature_flags'
  ) THEN
    ALTER TABLE profiles
      ADD COLUMN feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 2. Revoke direct UPDATE on feature_flags from authenticated
--    (users must not flip their own flags)
REVOKE UPDATE (feature_flags) ON profiles FROM authenticated;

-- 3. Helper: check if a feature is enabled for the current user
CREATE OR REPLACE FUNCTION has_feature_enabled(p_feature text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_flags jsonb;
BEGIN
  SELECT role, feature_flags INTO v_role, v_flags
  FROM profiles WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Owner always has everything
  IF v_role = 'super_admin' THEN
    RETURN true;
  END IF;

  -- Otherwise check the flag
  RETURN COALESCE((v_flags ->> p_feature)::boolean, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION has_feature_enabled(text) FROM anon;
GRANT EXECUTE ON FUNCTION has_feature_enabled(text) TO authenticated;

-- 4. Owner/manager function: set feature flags for a user
CREATE OR REPLACE FUNCTION set_user_feature_flags(
  p_target_user uuid,
  p_flags jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_caller_org uuid;
  v_target_org uuid;
BEGIN
  -- Identify the caller
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Owner can set flags for anyone
  IF v_caller_role = 'super_admin' THEN
    -- allowed
  ELSE
    -- Managers can set flags only for members of their own org
    SELECT organization_id INTO v_caller_org
    FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
    LIMIT 1;

    SELECT organization_id INTO v_target_org
    FROM organization_members
    WHERE user_id = p_target_user AND status = 'active'
    LIMIT 1;

    IF v_caller_role != 'manager'
       OR v_caller_org IS NULL
       OR v_target_org IS NULL
       OR v_caller_org != v_target_org THEN
      RAISE EXCEPTION 'Not authorized to set feature flags for this user';
    END IF;
  END IF;

  -- Only allow known feature keys (whitelist)
  -- Add future features here as they are introduced
  DECLARE
    v_clean jsonb;
    v_key text;
    v_val jsonb;
  BEGIN
    v_clean := '{}'::jsonb;
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_flags::jsonb) LOOP
      IF v_key IN ('instagram', 'linkedin') THEN
        v_clean := v_clean || jsonb_build_object(v_key, (v_val::text)::boolean);
      END IF;
    END LOOP;

    UPDATE profiles SET feature_flags = v_clean WHERE id = p_target_user;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_user_feature_flags(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION set_user_feature_flags(uuid, jsonb) TO authenticated;