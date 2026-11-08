-- Add read_at column to track when incoming messages were read by the account owner
ALTER TABLE instagram_webhook_events ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Add last_incoming_at to instagram_accounts to track the 24hr messaging window
-- per account (the most recent time any person sent a DM to this account)
ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS last_incoming_at timestamptz;

-- Backfill last_incoming_at from existing incoming message events
UPDATE instagram_accounts a
SET last_incoming_at = sub.latest_incoming
FROM (
  SELECT ig_user_id, MAX(created_at) AS latest_incoming
  FROM instagram_webhook_events
  WHERE event_type = 'message'
    AND direction = 'incoming'
  GROUP BY ig_user_id
) sub
WHERE a.page_scoped_id = sub.ig_user_id
  AND (a.last_incoming_at IS NULL OR a.last_incoming_at < sub.latest_incoming);
