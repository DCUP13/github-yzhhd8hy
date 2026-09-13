ALTER TABLE instagram_webhook_events
  ADD COLUMN IF NOT EXISTS media_image_url text;
