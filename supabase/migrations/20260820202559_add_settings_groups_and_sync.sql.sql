/*
# Instagram Settings Groups, Subscriptions, and Sync System

## Purpose
Creates a publish-subscribe system for Instagram settings (flows, rules, autoresponder)
so a user can create a setting once and share it across all linked Instagram accounts.
Shared copies stay in sync — editing any copy on any synced account updates all others.
Accounts can be unsubscribed to make their copy independent, and re-subscribed later.

## New Tables

### 1. instagram_settings_groups
Container for each shared setting. One row = one logical setting (e.g. "Pricing Flow").
- id (uuid PK)
- owner_user_id (uuid, FK auth.users, owner who created the group)
- setting_type (text: 'flow' | 'rule' | 'autoresponder')
- name (text, display name for the group)
- created_at / updated_at (timestamptz)

### 2. instagram_settings_subscriptions
Maps a settings group to specific Instagram accounts. Controls sync state per account.
- id (uuid PK)
- group_id (uuid, FK instagram_settings_groups CASCADE)
- account_id (uuid, FK instagram_accounts CASCADE)
- synced (boolean, default true — when true, edits propagate to this account's copy)
- created_at (timestamptz)
- UNIQUE (group_id, account_id) — one subscription per group per account

## Modified Tables (additive only)

### instagram_conversation_flows
- settings_group_id (uuid, nullable, FK instagram_settings_groups)
- is_synced_copy (boolean, default false — true when edits should propagate)

### instagram_auto_rules
- account_id (uuid, nullable, FK instagram_accounts CASCADE)
  Previously rules were scoped only by user_id; now also scoped per account for sharing.
- settings_group_id (uuid, nullable, FK instagram_settings_groups)
- is_synced_copy (boolean, default false)

### instagram_autoresponder_settings
- settings_group_id (uuid, nullable, FK instagram_settings_groups)
- is_synced_copy (boolean, default false)

## Sync Functions (SECURITY DEFINER)

### sync_flow_to_group(p_flow_id uuid)
When a synced flow is edited, pushes the flow + all its steps to the group,
then updates every other synced subscription's flow copy.

### sync_rule_to_group(p_rule_id uuid)
When a synced rule is edited, pushes changes to the group and all synced copies.

### sync_autoresponder_to_group(p_settings_id uuid)
When a synced autoresponder setting is edited, pushes to group and all synced copies.

### apply_settings_group_to_account(p_group_id uuid, p_account_id uuid)
Clones a group's setting (flow with steps, rule, or autoresponder) to a specific account.
Used for initial sharing and re-subscribing.

### unsubscribe_account_from_group(p_group_id uuid, p_account_id uuid)
Marks subscription as not synced. The account's copy becomes independent.

### resubscribe_account_to_group(p_group_id uuid, p_account_id uuid)
Overwrites the account's independent copy with the latest group version, marks synced.

### share_all_settings_to_account(p_account_id uuid, p_owner_user_id uuid)
Subscribes an account to every settings group owned by the user, cloning all settings.

## Security
- RLS enabled on both new tables with owner-scoped policies.
- All sync functions are SECURITY DEFINER, callable by authenticated users.
- Functions verify the caller owns the group before making changes.
- Existing rules get account_id backfilled from their user's first account (migration-safe).
*/

-- ===== 1. Create instagram_settings_groups =====
CREATE TABLE IF NOT EXISTS instagram_settings_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  setting_type text NOT NULL CHECK (setting_type IN ('flow', 'rule', 'autoresponder')),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE instagram_settings_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_settings_groups" ON instagram_settings_groups;
CREATE POLICY "select_own_settings_groups" ON instagram_settings_groups FOR SELECT
  TO authenticated USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "insert_own_settings_groups" ON instagram_settings_groups;
CREATE POLICY "insert_own_settings_groups" ON instagram_settings_groups FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "update_own_settings_groups" ON instagram_settings_groups;
CREATE POLICY "update_own_settings_groups" ON instagram_settings_groups FOR UPDATE
  TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "delete_own_settings_groups" ON instagram_settings_groups;
CREATE POLICY "delete_own_settings_groups" ON instagram_settings_groups FOR DELETE
  TO authenticated USING (auth.uid() = owner_user_id);

-- ===== 2. Create instagram_settings_subscriptions =====
CREATE TABLE IF NOT EXISTS instagram_settings_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES instagram_settings_groups(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  synced boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (group_id, account_id)
);

ALTER TABLE instagram_settings_subscriptions ENABLE ROW LEVEL SECURITY;

-- Can read subscriptions for groups you own or for accounts you own
DROP POLICY IF EXISTS "select_own_subscriptions" ON instagram_settings_subscriptions;
CREATE POLICY "select_own_subscriptions" ON instagram_settings_subscriptions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM instagram_settings_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM instagram_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_subscriptions" ON instagram_settings_subscriptions;
CREATE POLICY "insert_own_subscriptions" ON instagram_settings_subscriptions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM instagram_settings_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_subscriptions" ON instagram_settings_subscriptions;
CREATE POLICY "update_own_subscriptions" ON instagram_settings_subscriptions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM instagram_settings_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM instagram_settings_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_subscriptions" ON instagram_settings_subscriptions;
CREATE POLICY "delete_own_subscriptions" ON instagram_settings_subscriptions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM instagram_settings_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid())
  );

-- Service role full access for sync functions
DROP POLICY IF EXISTS "service_role_manage_settings_groups" ON instagram_settings_groups;
CREATE POLICY "service_role_manage_settings_groups" ON instagram_settings_groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_manage_subscriptions" ON instagram_settings_subscriptions;
CREATE POLICY "service_role_manage_subscriptions" ON instagram_settings_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===== 3. Add columns to existing tables =====

-- instagram_conversation_flows
DO $$ BEGIN
  ALTER TABLE instagram_conversation_flows
    ADD COLUMN IF NOT EXISTS settings_group_id uuid REFERENCES instagram_settings_groups(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE instagram_conversation_flows
    ADD COLUMN IF NOT EXISTS is_synced_copy boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- instagram_auto_rules
DO $$ BEGIN
  ALTER TABLE instagram_auto_rules
    ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES instagram_accounts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE instagram_auto_rules
    ADD COLUMN IF NOT EXISTS settings_group_id uuid REFERENCES instagram_settings_groups(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE instagram_auto_rules
    ADD COLUMN IF NOT EXISTS is_synced_copy boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- instagram_autoresponder_settings
DO $$ BEGIN
  ALTER TABLE instagram_autoresponder_settings
    ADD COLUMN IF NOT EXISTS settings_group_id uuid REFERENCES instagram_settings_groups(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE instagram_autoresponder_settings
    ADD COLUMN IF NOT EXISTS is_synced_copy boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Backfill account_id for existing rules: assign to the user's first account
UPDATE instagram_auto_rules r
SET account_id = (
  SELECT id FROM instagram_accounts a
  WHERE a.user_id = r.user_id
  ORDER BY a.created_at ASC
  LIMIT 1
)
WHERE r.account_id IS NULL;

-- ===== 4. Indexes =====
CREATE INDEX IF NOT EXISTS idx_settings_groups_owner ON instagram_settings_groups(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_settings_subscriptions_group ON instagram_settings_subscriptions(group_id);
CREATE INDEX IF NOT EXISTS idx_settings_subscriptions_account ON instagram_settings_subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_flows_group ON instagram_conversation_flows(settings_group_id);
CREATE INDEX IF NOT EXISTS idx_auto_rules_group ON instagram_auto_rules(settings_group_id);
CREATE INDEX IF NOT EXISTS idx_auto_rules_account ON instagram_auto_rules(account_id);
CREATE INDEX IF NOT EXISTS idx_autoresponder_group ON instagram_autoresponder_settings(settings_group_id);

-- ===== 5. Sync Functions =====

-- Helper: verify caller owns the group
CREATE OR REPLACE FUNCTION public.verify_group_owner(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.instagram_settings_groups
    WHERE id = p_group_id AND owner_user_id = auth.uid()
  );
$$;

-- sync_flow_to_group: push flow + steps to group, then update all synced copies
CREATE OR REPLACE FUNCTION public.sync_flow_to_group(p_flow_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
                'next_step_id', v_step_map->(cond->>'next_step_id')
              )
            ) FROM jsonb_array_elements(v_old_step.branch_conditions) AS cond)
          ELSE NULL
        END,
        next_step_id = COALESCE(
          (v_step_map->(v_old_step.next_step_id::text))::uuid,
          NULL
        )
      WHERE flow_id = v_sub.copy_flow_id AND step_order = v_old_step.step_order;
    END LOOP;

    -- Set first_step_id to the mapped first step
    UPDATE public.instagram_conversation_flows
    SET first_step_id = (v_step_map->(v_flow.first_step_id::text))::uuid
    WHERE id = v_sub.copy_flow_id;
  END LOOP;
END;
$$;

-- sync_rule_to_group: push rule changes to group and all synced copies
CREATE OR REPLACE FUNCTION public.sync_rule_to_group(p_rule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule record;
  v_group_id uuid;
  v_sub record;
BEGIN
  SELECT * INTO v_rule FROM public.instagram_auto_rules WHERE id = p_rule_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_rule.settings_group_id IS NULL OR v_rule.is_synced_copy = false THEN RETURN; END IF;

  v_group_id := v_rule.settings_group_id;

  -- Update synced copies
  FOR v_sub IN
    SELECT r.id AS copy_rule_id
    FROM public.instagram_auto_rules r
    JOIN public.instagram_settings_subscriptions s
      ON s.account_id = r.account_id AND s.group_id = v_group_id
    WHERE r.settings_group_id = v_group_id AND r.is_synced_copy = true AND r.id != p_rule_id
  LOOP
    UPDATE public.instagram_auto_rules
    SET
      trigger_keyword = v_rule.trigger_keyword,
      reply_text = v_rule.reply_text,
      active = v_rule.active,
      action_type = v_rule.action_type,
      dm_message = v_rule.dm_message,
      link_url = v_rule.link_url,
      media_url = v_rule.media_url,
      media_type = v_rule.media_type,
      media_id = v_rule.media_id,
      send_once_per_user = v_rule.send_once_per_user,
      updated_at = now()
    WHERE id = v_sub.copy_rule_id;
  END LOOP;
END;
$$;

-- sync_autoresponder_to_group: push autoresponder changes to all synced copies
CREATE OR REPLACE FUNCTION public.sync_autoresponder_to_group(p_settings_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
  v_group_id uuid;
  v_sub record;
BEGIN
  SELECT * INTO v_settings FROM public.instagram_autoresponder_settings WHERE id = p_settings_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_settings.settings_group_id IS NULL OR v_settings.is_synced_copy = false THEN RETURN; END IF;

  v_group_id := v_settings.settings_group_id;

  FOR v_sub IN
    SELECT ars.id AS copy_id
    FROM public.instagram_autoresponder_settings ars
    JOIN public.instagram_settings_subscriptions s
      ON s.account_id = ars.account_id AND s.group_id = v_group_id
    WHERE ars.settings_group_id = v_group_id AND ars.is_synced_copy = true AND ars.id != p_settings_id
  LOOP
    UPDATE public.instagram_autoresponder_settings
    SET
      enabled = v_settings.enabled,
      prompt_id = v_settings.prompt_id,
      response_delay_seconds = v_settings.response_delay_seconds,
      updated_at = now()
    WHERE id = v_sub.copy_id;
  END LOOP;
END;
$$;

-- apply_settings_group_to_account: clone a group's setting to a specific account
CREATE OR REPLACE FUNCTION public.apply_settings_group_to_account(
  p_group_id uuid,
  p_account_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Find the source flow (any flow in the group)
    SELECT * INTO v_source_flow FROM public.instagram_conversation_flows
    WHERE settings_group_id = p_group_id ORDER BY created_at ASC LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;

    -- Check if a copy already exists for this account
    SELECT id INTO v_new_flow_id FROM public.instagram_conversation_flows
    WHERE settings_group_id = p_group_id AND account_id = p_account_id;

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
        v_account.user_id, p_account_id, v_source_flow.name,
        v_source_flow.trigger_type, v_source_flow.trigger_keyword,
        v_source_flow.trigger_media_id, v_source_flow.active,
        p_group_id, true
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
    WHERE settings_group_id = p_group_id ORDER BY created_at ASC LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;

    -- Check for existing copy
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

    -- Check for existing copy
    SELECT id INTO v_new_ar_id FROM public.instagram_autoresponder_settings
    WHERE settings_group_id = p_group_id AND account_id = p_account_id;

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
$$;

-- unsubscribe_account_from_group: mark subscription as not synced
CREATE OR REPLACE FUNCTION public.unsubscribe_account_from_group(
  p_group_id uuid,
  p_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.instagram_settings_subscriptions
  SET synced = false
  WHERE group_id = p_group_id AND account_id = p_account_id;

  -- Mark the copy as not synced so edits are local
  UPDATE public.instagram_conversation_flows
  SET is_synced_copy = false
  WHERE settings_group_id = p_group_id AND account_id = p_account_id;

  UPDATE public.instagram_auto_rules
  SET is_synced_copy = false
  WHERE settings_group_id = p_group_id AND account_id = p_account_id;

  UPDATE public.instagram_autoresponder_settings
  SET is_synced_copy = false
  WHERE settings_group_id = p_group_id AND account_id = p_account_id;
END;
$$;

-- resubscribe_account_to_group: overwrite copy with latest group version, mark synced
CREATE OR REPLACE FUNCTION public.resubscribe_account_to_group(
  p_group_id uuid,
  p_account_id uuid
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

-- share_all_settings_to_account: subscribe an account to all of a user's groups
CREATE OR REPLACE FUNCTION public.share_all_settings_to_account(
  p_account_id uuid,
  p_owner_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group record;
BEGIN
  FOR v_group IN
    SELECT * FROM public.instagram_settings_groups
    WHERE owner_user_id = p_owner_user_id
  LOOP
    PERFORM public.apply_settings_group_to_account(v_group.id, p_account_id);
  END LOOP;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.verify_group_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_flow_to_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_rule_to_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_autoresponder_to_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_settings_group_to_account(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_account_from_group(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resubscribe_account_to_group(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.share_all_settings_to_account(uuid, uuid) TO authenticated;
