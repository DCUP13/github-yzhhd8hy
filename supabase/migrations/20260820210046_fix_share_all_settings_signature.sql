/*
# Fix share_all_settings_to_account signature mismatch

## Problem
The previous migration changed `apply_settings_group_to_account` to use `text` params
instead of `uuid`. But `share_all_settings_to_account` still has `uuid` params and calls
`apply_settings_group_to_account(v_group.id, p_account_id)` with uuid values. PostgreSQL
can't implicitly cast uuid to text in a function call, so it looks for the old
`(uuid, uuid)` signature which no longer exists — producing:
  "function public.apply_settings_group_to_account(uuid, uuid) does not exist"

## Fix
Recreate `share_all_settings_to_account` with `text` params, casting to uuid internally.
The call to `apply_settings_group_to_account` now passes text values (cast from uuid),
matching the new `(text, text)` signature.
*/

DROP FUNCTION IF EXISTS public.share_all_settings_to_account(uuid, uuid);
DROP FUNCTION IF EXISTS public.share_all_settings_to_account(text, text);

CREATE OR REPLACE FUNCTION public.share_all_settings_to_account(
  p_account_id text,
  p_owner_user_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid := p_account_id::uuid;
  v_owner_user_id uuid := p_owner_user_id::uuid;
  v_group record;
BEGIN
  FOR v_group IN
    SELECT * FROM public.instagram_settings_groups
    WHERE owner_user_id = v_owner_user_id
  LOOP
    PERFORM public.apply_settings_group_to_account(v_group.id::text, p_account_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.share_all_settings_to_account(text, text) TO authenticated;
