-- The original migration created a self-referencing FK on instagram_conversation_flows.first_step_id
-- pointing to instagram_conversation_flows(id) instead of instagram_flow_steps(id).
-- This made it impossible to set first_step_id to a step UUID, silently breaking flow execution.

DO $$ BEGIN
  ALTER TABLE instagram_conversation_flows DROP CONSTRAINT IF EXISTS fk_flow_first_step;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE instagram_conversation_flows
  ADD CONSTRAINT fk_flow_first_step
  FOREIGN KEY (first_step_id) REFERENCES instagram_flow_steps(id) ON DELETE SET NULL;
