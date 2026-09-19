ALTER TABLE instagram_post_batches
  ADD COLUMN IF NOT EXISTS overlay_settings jsonb DEFAULT NULL;