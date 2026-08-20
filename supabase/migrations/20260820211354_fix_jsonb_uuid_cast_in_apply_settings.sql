/*
# Fix jsonb-to-uuid cast in apply_settings_group_to_account

The v_step_map lookup returns jsonb, which cannot be directly cast to uuid.
Use ->> to extract text, then cast to uuid.
*/

CREATE OR REPLACE FUNCTION public.apply_settings_group_to_account(p_group_id uuid, p_account_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
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
SELECT * INTO v_group FROM public.instagram_settings_groups WHERE id = p_group_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Group not found'; END IF;

SELECT * INTO v_account FROM public.instagram_accounts WHERE id = p_account_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;

-- Create or update subscription
INSERT INTO public.instagram_settings_subscriptions (group_id, account_id, synced)
VALUES (p_group_id, p_account_id, true)
ON CONFLICT (group_id, account_id) DO UPDATE SET synced = true;

IF v_group.setting_type = 'flow' THEN
SELECT * INTO v_source_flow FROM public.instagram_conversation_flows
WHERE settings_group_id = p_group_id ORDER BY created_at ASC LIMIT 1;
IF NOT FOUND THEN RETURN NULL; END IF;

SELECT id INTO v_new_flow_id FROM public.instagram_conversation_flows
WHERE settings_group_id = p_group_id AND account_id = p_account_id;

IF v_new_flow_id IS NOT NULL THEN
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
INSERT INTO public.instagram_conversation_flows (
user_id, account_id, name, trigger_type, trigger_keyword,
trigger_media_id, active, settings_group_id, is_synced_copy
) VALUES (
v_account.user_id, p_account_id, v_source_flow.name,
v_source_flow.trigger_type, v_source_flow.trigger_keyword,
v_source_flow.trigger_media_id, v_source_flow.active,
p_group_id, true
)
RETURNING id INTO v_new_flow_id;
END IF;

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
'next_step_id', v_step_map ->> (cond->>'next_step_id')
)
) FROM jsonb_array_elements(v_source_step.branch_conditions) AS cond)
ELSE NULL
END,
next_step_id = COALESCE((v_step_map ->> (v_source_step.next_step_id::text))::uuid, NULL)
WHERE flow_id = v_new_flow_id AND step_order = v_source_step.step_order;
END LOOP;

UPDATE public.instagram_conversation_flows
SET first_step_id = COALESCE((v_step_map ->> (v_source_flow.first_step_id::text))::uuid, NULL)
WHERE id = v_new_flow_id;

RETURN v_new_flow_id;

ELSIF v_group.setting_type = 'rule' THEN
SELECT * INTO v_source_rule FROM public.instagram_auto_rules
WHERE settings_group_id = p_group_id ORDER BY created_at ASC LIMIT 1;
IF NOT FOUND THEN RETURN NULL; END IF;

SELECT id INTO v_new_rule_id FROM public.instagram_auto_rules
WHERE settings_group_id = p_group_id AND account_id = p_account_id;

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
v_account.user_id, p_account_id, v_source_rule.media_id,
v_source_rule.trigger_keyword, v_source_rule.reply_text, v_source_rule.active,
v_source_rule.action_type, v_source_rule.dm_message, v_source_rule.link_url,
v_source_rule.media_url, v_source_rule.media_type,
v_source_rule.send_once_per_user, p_group_id, true
)
RETURNING id INTO v_new_rule_id;
END IF;
RETURN v_new_rule_id;

ELSIF v_group.setting_type = 'autoresponder' THEN
SELECT * INTO v_source_ar FROM public.instagram_autoresponder_settings
WHERE settings_group_id = p_group_id ORDER BY created_at ASC LIMIT 1;
IF NOT FOUND THEN RETURN NULL; END IF;

-- Check for ANY existing autoresponder setting for this account
-- (UNIQUE constraint on account_id means we can't have two)
SELECT id INTO v_new_ar_id FROM public.instagram_autoresponder_settings
WHERE account_id = p_account_id;

IF v_new_ar_id IS NOT NULL THEN
-- Update the existing setting to use the group's values
UPDATE public.instagram_autoresponder_settings
SET
enabled = v_source_ar.enabled,
prompt_id = v_source_ar.prompt_id,
response_delay_seconds = v_source_ar.response_delay_seconds,
settings_group_id = p_group_id,
is_synced_copy = true,
updated_at = now()
WHERE id = v_new_ar_id;
ELSE
INSERT INTO public.instagram_autoresponder_settings (
account_id, user_id, enabled, prompt_id, response_delay_seconds,
settings_group_id, is_synced_copy
) VALUES (
p_account_id, v_account.user_id, v_source_ar.enabled,
v_source_ar.prompt_id, v_source_ar.response_delay_seconds,
p_group_id, true
)
RETURNING id INTO v_new_ar_id;
END IF;
RETURN v_new_ar_id;
END IF;

RETURN NULL;
END;
$function$;
