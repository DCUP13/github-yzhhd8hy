-- Copy flow steps from timeless.wealth.us flow to devoncuperus flow
-- The sync only copied the flow row, not the steps. This manually copies them
-- and sets the first_step_id on the devoncuperus flow.

DO $$
DECLARE
  source_flow_id uuid := 'b03a3481-6c4e-4db8-94af-dd722a6d3340';
  target_flow_id uuid := '0c891cd2-44d8-45e6-861d-7cef3548e962';
  target_user_id uuid := '23641891-67d8-47ec-8024-644677032072';
  step_record RECORD;
  new_step_id uuid;
  first_new_step_id uuid := NULL;
  id_map jsonb := '{}'::jsonb;
  old_id_text text;
  new_id_text text;
BEGIN
  FOR step_record IN
    SELECT * FROM instagram_flow_steps
    WHERE flow_id = source_flow_id
    ORDER BY step_order ASC
  LOOP
    new_step_id := gen_random_uuid();
    IF first_new_step_id IS NULL THEN
      first_new_step_id := new_step_id;
    END IF;
    id_map := id_map || jsonb_build_object(step_record.id::text, new_step_id::text);

    INSERT INTO instagram_flow_steps (
      id, flow_id, user_id, step_order,
      message_text, link_url, media_url, media_type,
      wait_for_reply, wait_timeout_minutes,
      branch_type, branch_conditions, next_step_id,
      created_at, updated_at
    ) VALUES (
      new_step_id, target_flow_id, target_user_id, step_record.step_order,
      step_record.message_text, step_record.link_url, step_record.media_url, step_record.media_type,
      step_record.wait_for_reply, step_record.wait_timeout_minutes,
      step_record.branch_type, step_record.branch_conditions, NULL,
      now(), now()
    );
  END LOOP;

  -- Resolve next_step_id for copied steps
  FOR step_record IN
    SELECT * FROM instagram_flow_steps
    WHERE flow_id = source_flow_id
    ORDER BY step_order ASC
  LOOP
    old_id_text := step_record.next_step_id::text;
    IF old_id_text IS NOT NULL AND id_map ? old_id_text THEN
      new_id_text := id_map ->> old_id_text;
      UPDATE instagram_flow_steps
      SET next_step_id = new_id_text::uuid
      WHERE flow_id = target_flow_id
        AND step_order = step_record.step_order;
    END IF;
  END LOOP;

  -- Set first_step_id on the target flow
  IF first_new_step_id IS NOT NULL THEN
    UPDATE instagram_conversation_flows
    SET first_step_id = first_new_step_id, updated_at = now()
    WHERE id = target_flow_id;
  END IF;
END $$;