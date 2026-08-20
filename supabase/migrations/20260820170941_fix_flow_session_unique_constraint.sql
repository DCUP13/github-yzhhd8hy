-- The original UNIQUE(flow_id, sender_id) constraint blocks re-creating a session
-- for the same person after their previous session was cancelled/completed/expired.
-- Replace it with a partial unique index that only applies to active/waiting sessions.

ALTER TABLE instagram_flow_sessions DROP CONSTRAINT IF EXISTS instagram_flow_sessions_flow_id_sender_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_session_active_unique
  ON instagram_flow_sessions (flow_id, sender_id)
  WHERE status IN ('active', 'waiting_reply');
