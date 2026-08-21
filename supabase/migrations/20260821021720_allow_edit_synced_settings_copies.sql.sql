-- Allow the owner of a settings group to edit/delete synced copies on other accounts.
-- Currently RLS only allows auth.uid() = user_id, but synced copies have a different
-- user_id (the target account owner). The group owner should be able to edit all copies.

-- Helper: returns true if the caller owns the settings group the row belongs to
CREATE OR REPLACE FUNCTION owns_settings_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM instagram_settings_groups g
    WHERE g.id = p_group_id AND g.owner_user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION owns_settings_group(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION owns_settings_group(uuid) TO authenticated;

-- === instagram_conversation_flows: add group-owner UPDATE and DELETE ===
CREATE POLICY "update_group_owner_flows"
  ON instagram_conversation_flows FOR UPDATE
  TO authenticated
  USING (settings_group_id IS NOT NULL AND owns_settings_group(settings_group_id))
  WITH CHECK (settings_group_id IS NOT NULL AND owns_settings_group(settings_group_id));

CREATE POLICY "delete_group_owner_flows"
  ON instagram_conversation_flows FOR DELETE
  TO authenticated
  USING (settings_group_id IS NOT NULL AND owns_settings_group(settings_group_id));

-- === instagram_flow_steps: add group-owner UPDATE, INSERT, DELETE ===
-- Flow steps don't have their own settings_group_id, but we can check via the parent flow.
CREATE OR REPLACE FUNCTION step_belongs_to_owned_group(p_step_id uuid)
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

REVOKE EXECUTE ON FUNCTION step_belongs_to_owned_group(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION step_belongs_to_owned_group(uuid) TO authenticated;

CREATE POLICY "update_group_owner_flow_steps"
  ON instagram_flow_steps FOR UPDATE
  TO authenticated
  USING (step_belongs_to_owned_group(id))
  WITH CHECK (step_belongs_to_owned_group(id));

CREATE POLICY "delete_group_owner_flow_steps"
  ON instagram_flow_steps FOR DELETE
  TO authenticated
  USING (step_belongs_to_owned_group(id));

-- For INSERT, we need to check the flow_id being inserted into
CREATE OR REPLACE FUNCTION flow_belongs_to_owned_group(p_flow_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM instagram_conversation_flows f
    WHERE f.id = p_flow_id
      AND f.settings_group_id IS NOT NULL
      AND owns_settings_group(f.settings_group_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION flow_belongs_to_owned_group(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION flow_belongs_to_owned_group(uuid) TO authenticated;

CREATE POLICY "insert_group_owner_flow_steps"
  ON instagram_flow_steps FOR INSERT
  TO authenticated
  WITH CHECK (flow_belongs_to_owned_group(flow_id));

-- === instagram_auto_rules: add group-owner UPDATE, DELETE ===
CREATE POLICY "update_group_owner_auto_rules"
  ON instagram_auto_rules FOR UPDATE
  TO authenticated
  USING (settings_group_id IS NOT NULL AND owns_settings_group(settings_group_id))
  WITH CHECK (settings_group_id IS NOT NULL AND owns_settings_group(settings_group_id));

CREATE POLICY "delete_group_owner_auto_rules"
  ON instagram_auto_rules FOR DELETE
  TO authenticated
  USING (settings_group_id IS NOT NULL AND owns_settings_group(settings_group_id));

-- === instagram_autoresponder_settings: add group-owner UPDATE, DELETE ===
CREATE POLICY "update_group_owner_autoresponder"
  ON instagram_autoresponder_settings FOR UPDATE
  TO authenticated
  USING (settings_group_id IS NOT NULL AND owns_settings_group(settings_group_id))
  WITH CHECK (settings_group_id IS NOT NULL AND owns_settings_group(settings_group_id));

CREATE POLICY "delete_group_owner_autoresponder"
  ON instagram_autoresponder_settings FOR DELETE
  TO authenticated
  USING (settings_group_id IS NOT NULL AND owns_settings_group(settings_group_id));
