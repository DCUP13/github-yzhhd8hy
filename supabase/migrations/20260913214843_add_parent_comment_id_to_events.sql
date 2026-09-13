ALTER TABLE instagram_webhook_events
  ADD COLUMN IF NOT EXISTS parent_comment_id text;