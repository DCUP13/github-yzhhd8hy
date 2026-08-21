/*
# Auto-create settings groups for existing unshared settings

When a user clicks "Share All Settings" on a new account, we need to:
1. Auto-create groups for all unshared flows, rules, and autoresponder settings on the source account
2. Share all groups to the target account

This function scans the source account for settings without a settings_group_id,
creates a group for each, links the setting to it, and creates a subscription.
Then shares all the user's groups to the target account.
*/
CREATE OR REPLACE FUNCTION public.share_all_settings_from_to(
  p_source_account_id uuid,
  p_target_account_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flow record;
  v_rule record;
  v_ar record;
  v_group_id uuid;
  v_source_acct record;
  v_target_acct record;
BEGIN
  SELECT * INTO v_source_acct FROM public.instagram_accounts WHERE id = p_source_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source account not found'; END IF;

  SELECT * INTO v_target_acct FROM public.instagram_accounts WHERE id = p_target_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target account not found'; END IF;

  -- Auto-create groups for unshared flows on the source account
  FOR v_flow IN
    SELECT * FROM public.instagram_conversation_flows
    WHERE account_id = p_source_account_id AND settings_group_id IS NULL
  LOOP
    INSERT INTO public.instagram_settings_groups (owner_user_id, setting_type, name)
    VALUES (p_user_id, 'flow', v_flow.name)
    RETURNING id INTO v_group_id;

    UPDATE public.instagram_conversation_flows
    SET settings_group_id = v_group_id, is_synced_copy = true
    WHERE id = v_flow.id;

    INSERT INTO public.instagram_settings_subscriptions (group_id, account_id, synced)
    VALUES (v_group_id, p_source_account_id, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Auto-create groups for unshared rules on the source account
  FOR v_rule IN
    SELECT * FROM public.instagram_auto_rules
    WHERE account_id = p_source_account_id AND settings_group_id IS NULL
  LOOP
    INSERT INTO public.instagram_settings_groups (owner_user_id, setting_type, name)
    VALUES (p_user_id, 'rule', v_rule.trigger_keyword)
    RETURNING id INTO v_group_id;

    UPDATE public.instagram_auto_rules
    SET settings_group_id = v_group_id, is_synced_copy = true
    WHERE id = v_rule.id;

    INSERT INTO public.instagram_settings_subscriptions (group_id, account_id, synced)
    VALUES (v_group_id, p_source_account_id, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Auto-create groups for unshared autoresponder settings on the source account
  FOR v_ar IN
    SELECT * FROM public.instagram_autoresponder_settings
    WHERE account_id = p_source_account_id AND settings_group_id IS NULL
  LOOP
    INSERT INTO public.instagram_settings_groups (owner_user_id, setting_type, name)
    VALUES (p_user_id, 'autoresponder', 'Autoresponder Settings')
    RETURNING id INTO v_group_id;

    UPDATE public.instagram_autoresponder_settings
    SET settings_group_id = v_group_id, is_synced_copy = true
    WHERE id = v_ar.id;

    INSERT INTO public.instagram_settings_subscriptions (group_id, account_id, synced)
    VALUES (v_group_id, p_source_account_id, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Now share all groups to the target account
  PERFORM public.share_all_settings_to_account(p_target_account_id, p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.share_all_settings_from_to(uuid, uuid, uuid) TO authenticated;
