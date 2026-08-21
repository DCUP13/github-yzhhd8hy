/*
# Fix "cannot cast jsonb to uuid" error in settings sharing RPCs

## Problem
When the frontend calls `apply_settings_group_to_account`, `unsubscribe_account_from_group`,
or `resubscribe_account_to_group` via `supabase.rpc()`, PostgREST sends the parameters as
a JSON body. PostgREST sometimes fails to match the JSON keys to `uuid`-typed function
parameters, falling back to passing the entire body as a single `jsonb` argument. This
produces the error: "cannot cast jsonb to uuid".

## Fix
Recreate the three affected functions with `text` parameters instead of `uuid`. The
function bodies cast the text values to `uuid` explicitly. PostgREST can always pass
JSON string values to `text` parameters, so the fallback path never triggers a type
mismatch.

## Changes
1. `apply_settings_group_to_account(p_group_id text, p_account_id text)` — casts both
   params to uuid internally, same logic as before.
2. `unsubscribe_account_from_group(p_group_id text, p_account_id text)` — same approach.
3. `resubscribe_account_to_group(p_group_id text, p_account_id text)` — same approach.
4. Re-grant EXECUTE to authenticated.
*/

-- Drop and recreate apply_settings_group_to_account with text params
DROP FUNCTION IF EXISTS public.apply_settings_group_to_account(uuid, uuid);
DROP FUNCTION IF EXISTS public.apply_settings_group_to_account(text, text);

CREATE OR REPLACE FUNCTION public.apply_settings_group_to_account(
  p_group_id text,
  p_account_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid := p_group_id::uuid;
  v_account_id uuid := p_account_id::uuid;
  v_group record;
  v_source_flow record;
  v_new_flow_id uuid;
  v_source_step record;
  v_new_step_id uuid;
  v_step_map jsonb;
  v_source_rule record;
  v_new_rule_id uuid;
  v_source_ar record;
  v_new_ar_id uuid;
  v_account record;
BEGIN
  SELECT * INTO v_group FROM public.instagram_settings_groups WHERE id = v_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Group not found'; END IF;

  SELECT * INTO v_account FROM public.instagram_accounts WHERE id = v_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;

  -- Create or update subscription
  INSERT INTO public.instagram_settings_subscriptions (group_id, account_id, synced)
  VALUES (v_group_id, v_account_id, true)
  ON CONFLICT (group_id, account_id) DO UPDATE SET synced = true;

  IF v_group.setting_type = 'flow' THEN
    -- Find the source flow (any flow in the group)
    SELECT * INTO v_source_flow FROM public.instagram_conversation_flows
    WHERE settings_group_id = v_group_id ORDER BY created_at ASC LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;

    -- Check if a copy already exists for this account
    SELECT id INTO v_new_flow_id FROM public.instagram_conversation_flows
    WHERE settings_group_id = v_group_id AND account_id = v_account_id;

    IF v_new_flow_id IS NOT NULL THEN
      -- Update existing copy: delete old steps and re-create
      UPDATE public.instagram_conversation_flows
      SET
        name = v_source_flow.name,
        trigger_type = v_source_flow.trigger_type,
        trigger_keyword = v_source_flow.trigger_keyword,
        trigger_media_id = v_source_flow.trigger_media_id,
        active = v_source_flow.active,
        is_synced_copy = true,
        updated_at = now()
      WHERE id = v_new_flow_id;

      DELETE FROM public.instagram_flow_steps WHERE flow_id = v_new_flow_id;
    ELSE
      -- Create new copy
      INSERT INTO public.instagram_conversation_flows (
        user_id, account_id, name, trigger_type, trigger_keyword,
        trigger_media_id, active, settings_group_id, is_synced_copy
      ) VALUES (
        v_account.user_id, v_account_id, v_source_flow.name,
        v_source_flow.trigger_type, v_source_flow.trigger_keyword,
        v_source_flow.trigger_media_id, v_source_flow.active,
        v_group_id, true
      )
      RETURNING id INTO v_new_flow_id;
    END IF;

    -- Clone steps
    v_step_map := '{}'::jsonb;
    FOR v_source_step IN
      SELECT * FROM public.instagram_flow_steps
      WHERE flow_id = v_source_flow.id ORDER BY step_order ASC
    LOOP
      INSERT INTO public.instagram_flow_steps (
        flow_id, user_id, step_order, message_text, link_url, media_url, media_type,
        wait_for_reply, wait_timeout_minutes, branch_type, branch_conditions, next_step_id
      ) VALUES (
        v_new_flow_id, v_account.user_id, v_source_step.step_order,
        v_source_step.message_text, v_source_step.link_url, v_source_step.media_url, v_source_step.media_type,
        v_source_step.wait_for_reply, v_source_step.wait_timeout_minutes,
        v_source_step.branch_type, v_source_step.branch_conditions, NULL
      )
      RETURNING id INTO v_new_step_id;

      v_step_map := v_step_map || jsonb_build_object(v_source_step.id, v_new_step_id);
    END LOOP;

    -- Remap branch conditions and next_step_id
    FOR v_source_step IN
      SELECT id, branch_conditions, next_step_id, step_order FROM public.instagram_flow_steps
      WHERE flow_id = v_source_flow.id ORDER BY step_order ASC
    LOOP
      UPDATE public.instagram_flow_steps
      SET
        branch_conditions = CASE
          WHEN v_source_step.branch_conditions IS NOT NULL THEN
            (SELECT jsonb_agg(
              jsonb_build_object(
                'keyword', cond->>'keyword',
                'next_step_id', v_step_map->(cond->>'next_step_id')
              )
            ) FROM jsonb_array_elements(v_source_step.branch_conditions) AS cond)
          ELSE NULL
        END,
        next_step_id = COALESCE((v_step_map->(v_source_step.next_step_id::text))::uuid, NULL)
      WHERE flow_id = v_new_flow_id AND step_order = v_source_step.step_order;
    END LOOP;

    -- Set first_step_id
    UPDATE public.instagram_conversation_flows
    SET first_step_id = COALESCE((v_step_map->(v_source_flow.first_step_id::text))::uuid, NULL)
    WHERE id = v_new_flow_id;

    RETURN v_new_flow_id;

  ELSIF v_group.setting_type = 'rule' THEN
    SELECT * INTO v_source_rule FROM public.instagram_auto_rules
    WHERE settings_group_id = v_group_id ORDER BY created_at ASC LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;

    -- Check for existing copy
    SELECT id INTO v_new_rule_id FROM public.instagram_auto_rules
    WHERE settings_group_id = v_group_id AND account_id = v_account_id;

    IF v_new_rule_id IS NOT NULL THEN
      UPDATE public.instagram_auto_rules
      SET
        trigger_keyword = v_source_rule.trigger_keyword,
        reply_text = v_source_rule.reply_text,
        active = v_source_rule.active,
        action_type = v_source_rule.action_type,
        dm_message = v_source_rule.dm_message,
        link_url = v_source_rule.link_url,
        media_url = v_source_rule.media_url,
        media_type = v_source_rule.media_type,
        media_id = v_source_rule.media_id,
        send_once_per_user = v_source_rule.send_once_per_user,
        is_synced_copy = true,
        updated_at = now()
      WHERE id = v_new_rule_id;
    ELSE
      INSERT INTO public.instagram_auto_rules (
        user_id, account_id, media_id, trigger_keyword, reply_text, active,
        action_type, dm_message, link_url, media_url, media_type,
        send_once_per_user, settings_group_id, is_synced_copy
      ) VALUES (
        v_account.user_id, v_account_id, v_source_rule.media_id,
        v_source_rule.trigger_keyword, v_source_rule.reply_text, v_source_rule.active,
        v_source_rule.action_type, v_source_rule.dm_message, v_source_rule.link_url,
        v_source_rule.media_url, v_source_rule.media_type,
        v_source_rule.send_once_per_user, v_group_id, true
      )
      RETURNING id INTO v_new_rule_id;
    END IF;

    RETURN v_new_rule_id;

  ELSIF v_group.setting_type = 'autoresponder' THEN
    SELECT * INTO v_source_ar FROM public.instagram_autoresponder_settings
    WHERE settings_group_id = v_group_id ORDER BY created_at ASC LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;

    -- Check for existing copy
    SELECT id INTO v_new_ar_id FROM public.instagram_autoresponder_settings
    WHERE settings_group_id = v_group_id AND account_id = v_account_id;

    IF v_new_ar_id IS NOT NULL THEN
      UPDATE public.instagram_autoresponder_settings
      SET
        enabled = v_source_ar.enabled,
        prompt_id = v_source_ar.prompt_id,
        response_delay_seconds = v_source_ar.response_delay_seconds,
        is_synced_copy = true,
        updated_at = now()
      WHERE id = v_new_ar_id;
    ELSE
      INSERT INTO public.instagram_autoresponder_settings (
        account_id, user_id, enabled, prompt_id, response_delay_seconds,
        settings_group_id, is_synced_copy
      ) VALUES (
        v_account_id, v_account.user_id, v_source_ar.enabled,
        v_source_ar.prompt_id, v_source_ar.response_delay_seconds,
        v_group_id, true
      )
      RETURNING id INTO v_new_ar_id;
    END IF;

    RETURN v_new_ar_id;
  END IF;

  RETURN NULL;
END;
$$;

-- Drop and recreate unsubscribe_account_from_group with text params
DROP FUNCTION IF EXISTS public.unsubscribe_account_from_group(uuid, uuid);
DROP FUNCTION IF EXISTS public.unsubscribe_account_from_group(text, text);

CREATE OR REPLACE FUNCTION public.unsubscribe_account_from_group(
  p_group_id text,
  p_account_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid := p_group_id::uuid;
  v_account_id uuid := p_account_id::uuid;
BEGIN
  UPDATE public.instagram_settings_subscriptions
  SET synced = false
  WHERE group_id = v_group_id AND account_id = v_account_id;

  -- Mark the copy as not synced so edits are local
  UPDATE public.instagram_conversation_flows
  SET is_synced_copy = false
  WHERE settings_group_id = v_group_id AND account_id = v_account_id;

  UPDATE public.instagram_auto_rules
  SET is_synced_copy = false
  WHERE settings_group_id = v_group_id AND account_id = v_account_id;

  UPDATE public.instagram_autoresponder_settings
  SET is_synced_copy = false
  WHERE settings_group_id = v_group_id AND account_id = v_account_id;
END;
$$;

-- Drop and recreate resubscribe_account_to_group with text params
DROP FUNCTION IF EXISTS public.resubscribe_account_to_group(uuid, uuid);
DROP FUNCTION IF EXISTS public.resubscribe_account_to_group(text, text);

CREATE OR REPLACE FUNCTION public.resubscribe_account_to_group(
  p_group_id text,
  p_account_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Re-apply the group's latest version to this account
  PERFORM public.apply_settings_group_to_account(p_group_id, p_account_id);
END;
$$;

-- Re-grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.apply_settings_group_to_account(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_account_from_group(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resubscribe_account_to_group(text, text) TO authenticated;
