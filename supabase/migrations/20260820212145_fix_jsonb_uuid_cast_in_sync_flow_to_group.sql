/*
# Fix jsonb-to-uuid cast in sync_flow_to_group

Same bug as apply_settings_group_to_account: v_step_map->key returns jsonb,
which can't be cast to uuid. Use ->> to extract text first, then cast.
Also fix branch_conditions to use ->> instead of -> for the next_step_id value.
*/

CREATE OR REPLACE FUNCTION public.sync_flow_to_group(p_flow_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_flow record;
v_group_id uuid;
v_sub record;
v_old_step record;
v_new_step_id uuid;
v_step_id_map jsonb;
v_step_map jsonb := '{}'::jsonb;
BEGIN
SELECT * INTO v_flow FROM public.instagram_conversation_flows WHERE id = p_flow_id;
IF NOT FOUND THEN RETURN; END IF;
IF v_flow.settings_group_id IS NULL OR v_flow.is_synced_copy = false THEN RETURN; END IF;

v_group_id := v_flow.settings_group_id;

-- Update group name
UPDATE public.instagram_settings_groups
SET name = v_flow.name, updated_at = now()
WHERE id = v_group_id;

-- For each synced subscription (excluding the current flow's account), update the copy
FOR v_sub IN
SELECT s.account_id, f.id AS copy_flow_id
FROM public.instagram_settings_subscriptions s
JOIN public.instagram_conversation_flows f
ON f.settings_group_id = v_group_id AND f.account_id = s.account_id
WHERE s.group_id = v_group_id AND s.synced = true AND f.id != p_flow_id
LOOP
-- Update the flow copy's fields
UPDATE public.instagram_conversation_flows
SET
trigger_type = v_flow.trigger_type,
trigger_keyword = v_flow.trigger_keyword,
trigger_media_id = v_flow.trigger_media_id,
active = v_flow.active,
updated_at = now()
WHERE id = v_sub.copy_flow_id;

-- Delete old steps and re-create from source
DELETE FROM public.instagram_flow_steps WHERE flow_id = v_sub.copy_flow_id;

v_step_map := '{}'::jsonb;
FOR v_old_step IN
SELECT * FROM public.instagram_flow_steps
WHERE flow_id = p_flow_id
ORDER BY step_order ASC
LOOP
INSERT INTO public.instagram_flow_steps (
flow_id, user_id, step_order, message_text, link_url, media_url, media_type,
wait_for_reply, wait_timeout_minutes, branch_type, branch_conditions, next_step_id
) VALUES (
v_sub.copy_flow_id, v_flow.user_id, v_old_step.step_order,
v_old_step.message_text, v_old_step.link_url, v_old_step.media_url, v_old_step.media_type,
v_old_step.wait_for_reply, v_old_step.wait_timeout_minutes,
v_old_step.branch_type, v_old_step.branch_conditions, NULL
)
RETURNING id INTO v_new_step_id;

v_step_map := v_step_map || jsonb_build_object(v_old_step.id, v_new_step_id);
END LOOP;

-- Remap branch_conditions and next_step_id using the step map
FOR v_old_step IN
SELECT id, branch_conditions, next_step_id, step_order FROM public.instagram_flow_steps
WHERE flow_id = p_flow_id ORDER BY step_order ASC
LOOP
UPDATE public.instagram_flow_steps
SET
branch_conditions = CASE
WHEN v_old_step.branch_conditions IS NOT NULL THEN
(SELECT jsonb_agg(
jsonb_build_object(
'keyword', cond->>'keyword',
'next_step_id', v_step_map ->> (cond->>'next_step_id')
)
) FROM jsonb_array_elements(v_old_step.branch_conditions) AS cond)
ELSE NULL
END,
next_step_id = COALESCE(
(v_step_map ->> (v_old_step.next_step_id::text))::uuid,
NULL
)
WHERE flow_id = v_sub.copy_flow_id AND step_order = v_old_step.step_order;
END LOOP;

-- Set first_step_id to the mapped first step
UPDATE public.instagram_conversation_flows
SET first_step_id = COALESCE((v_step_map ->> (v_flow.first_step_id::text))::uuid, NULL)
WHERE id = v_sub.copy_flow_id;
END LOOP;
END;
$function$;
