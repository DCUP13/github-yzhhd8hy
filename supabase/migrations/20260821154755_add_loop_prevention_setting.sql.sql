/*
# Add loop prevention toggle and clean up stuck flow sessions

## Changes

1. Add `loop_prevention_enabled` column to `instagram_refresh_settings`
   - Boolean, defaults to `true` (enabled by default)
   - When enabled, automated replies between a user's own connected accounts
     will NOT trigger new flows, auto-rules, or the autoresponder on the
     receiving account. Manual messages still trigger everything normally.

2. Mark all currently stuck flow sessions as completed
   - Sessions with status 'active' and no current_step_id where the flow has
     no steps or no first_step_id get marked as completed so they stop
     blocking new sessions.
*/

ALTER TABLE instagram_refresh_settings
  ADD COLUMN IF NOT EXISTS loop_prevention_enabled boolean DEFAULT true;

-- Clean up stuck sessions: active sessions with no current_step_id
-- where the flow has no steps
UPDATE instagram_flow_sessions s
SET status = 'completed',
    completed_at = now()
WHERE s.status = 'active'
  AND s.current_step_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM instagram_flow_steps fs WHERE fs.flow_id = s.flow_id
  );

-- Also clean up active sessions with no current_step_id where the flow
-- does have steps but first_step_id was never set — these will be
-- recovered by the existing fallback logic, but if they've been stuck
-- for more than 1 hour, complete them to avoid blocking.
UPDATE instagram_flow_sessions s
SET status = 'completed',
    completed_at = now()
WHERE s.status = 'active'
  AND s.current_step_id IS NULL
  AND s.last_interacted_at < now() - interval '1 hour';
