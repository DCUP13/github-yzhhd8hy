/*
# Add account-level sync/unsync/resync functions

1. New Functions
- `sync_account_settings(p_source_account_id, p_target_account_id, p_user_id)`:
  Auto-creates groups for any unshared settings on the source account, then
  applies all groups to the target account. This is the "check the box" action.
  Reuses existing `share_all_settings_from_to` logic.
- `unsync_account_settings(p_account_id)`:
  Sets synced=false and is_synced_copy=false for ALL settings groups that
  the given account belongs to. The data stays in place but becomes independent.
  This is the "uncheck the box" action.
- `resync_account_settings(p_source_account_id, p_target_account_id, p_user_id)`:
  Force re-applies all groups from the source account to the target,
  overwriting stale or empty copies. Fixes the broken flows with zero steps.

2. Security
- All functions are SECURITY DEFINER so they can operate across accounts.
- No new tables or columns.

3. Notes
- `sync_account_settings` is a wrapper around `share_all_settings_from_to`.
- `unsync_account_settings` iterates all groups the account is subscribed to
  and calls `unsubscribe_account_from_group` for each.
- `resync_account_settings` iterates all groups owned by the user and
  re-applies them to the target account via `apply_settings_group_to_account`.
*/

-- sync_account_settings: check the box = share everything from source to target
CREATE OR REPLACE FUNCTION public.sync_account_settings(
  p_source_account_id uuid,
  p_target_account_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.share_all_settings_from_to(p_source_account_id, p_target_account_id, p_user_id);
END;
$function$;

-- unsync_account_settings: uncheck the box = make all groups independent for this account
CREATE OR REPLACE FUNCTION public.unsync_account_settings(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id uuid;
BEGIN
  FOR v_group_id IN
    SELECT DISTINCT group_id FROM public.instagram_settings_subscriptions
    WHERE account_id = p_account_id AND synced = true
  LOOP
    PERFORM public.unsubscribe_account_from_group(v_group_id, p_account_id);
  END LOOP;
END;
$function$;

-- resync_account_settings: force re-apply all groups to target (fixes broken/empty copies)
CREATE OR REPLACE FUNCTION public.resync_account_settings(
  p_source_account_id uuid,
  p_target_account_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_group record;
BEGIN
  -- Auto-create groups for any unshared settings on the source account first
  PERFORM public.share_all_settings_from_to(p_source_account_id, p_target_account_id, p_user_id);

  -- Then re-apply ALL groups owned by this user to the target (overwrites stale data)
  FOR v_group IN
    SELECT * FROM public.instagram_settings_groups
    WHERE owner_user_id = p_user_id
  LOOP
    -- Ensure the target is subscribed to this group
    INSERT INTO public.instagram_settings_subscriptions (group_id, account_id, synced)
    VALUES (v_group.id, p_target_account_id, true)
    ON CONFLICT DO NOTHING;

    -- Re-apply (overwrites existing copies)
    PERFORM public.apply_settings_group_to_account(v_group.id, p_target_account_id);
  END LOOP;
END;
$function$;
