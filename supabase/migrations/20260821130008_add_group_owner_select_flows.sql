/*
# Allow group owners to SELECT synced flow copies on other accounts

## Purpose
The group owner (who created a settings group) currently can UPDATE and DELETE
synced flow copies on other accounts (added in a prior migration), but cannot
SELECT them. This means the FlowBuilder UI can't list or open flows that belong
to a synced account. This migration adds SELECT policies so the group owner can
read those flows and their steps.

## Changes
1. instagram_conversation_flows: new SELECT policy "select_group_owner_flows"
   - Allows SELECT when the flow has a settings_group_id and the caller owns that group
2. instagram_flow_steps: new SELECT policy "select_group_owner_flow_steps"
   - Allows SELECT when the step's parent flow belongs to a group the caller owns
3. instagram_flow_sessions: new SELECT policy "select_group_owner_flow_sessions"
   - Allows SELECT when the session's parent flow belongs to a group the caller owns

## Security
- All three policies use the existing owns_settings_group() SECURITY DEFINER helper.
- The step/session check joins through instagram_conversation_flows to find the group_id.
- No data is lost; only additive SELECT policies.
*/

-- Flow-level SELECT for group owners
DROP POLICY IF EXISTS "select_group_owner_flows" ON instagram_conversation_flows;
CREATE POLICY "select_group_owner_flows"
  ON instagram_conversation_flows FOR SELECT
  TO authenticated
  USING (settings_group_id IS NOT NULL AND owns_settings_group(settings_group_id));

-- Flow steps: SELECT for group owners (check via parent flow)
CREATE OR REPLACE FUNCTION step_flow_belongs_to_owned_group(p_step_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM instagram_flow_steps s
    JOIN instagram_conversation_flows f ON f.id = s.flow_id
    WHERE s.id = p_step_id
      AND f.settings_group_id IS NOT NULL
      AND owns_settings_group(f.settings_group_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION step_flow_belongs_to_owned_group(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION step_flow_belongs_to_owned_group(uuid) TO authenticated;

DROP POLICY IF EXISTS "select_group_owner_flow_steps" ON instagram_flow_steps;
CREATE POLICY "select_group_owner_flow_steps"
  ON instagram_flow_steps FOR SELECT
  TO authenticated
  USING (step_flow_belongs_to_owned_group(id));

-- Flow sessions: SELECT for group owners (check via parent flow)
CREATE OR REPLACE FUNCTION session_flow_belongs_to_owned_group(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM instagram_flow_sessions sess
    JOIN instagram_conversation_flows f ON f.id = sess.flow_id
    WHERE sess.id = p_session_id
      AND f.settings_group_id IS NOT NULL
      AND owns_settings_group(f.settings_group_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION session_flow_belongs_to_owned_group(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION session_flow_belongs_to_owned_group(uuid) TO authenticated;

DROP POLICY IF EXISTS "select_group_owner_flow_sessions" ON instagram_flow_sessions;
CREATE POLICY "select_group_owner_flow_sessions"
  ON instagram_flow_sessions FOR SELECT
  TO authenticated
  USING (session_flow_belongs_to_owned_group(id));
