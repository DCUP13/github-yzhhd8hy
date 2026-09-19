ALTER TABLE instagram_post_processes
  ADD COLUMN IF NOT EXISTS overlay_settings jsonb DEFAULT NULL;