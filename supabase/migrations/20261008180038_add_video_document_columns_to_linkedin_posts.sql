/*
# Add video and document columns to linkedin_posts

1. Changes to existing tables
- `linkedin_posts`: add `video_url` (text, nullable) — stores the source URL for video uploads
- `linkedin_posts`: add `video_asset_id` (text, nullable) — stores LinkedIn's video URN after initializeUpload
- `linkedin_posts`: add `document_url` (text, nullable) — stores the source URL for document/PDF uploads
- `linkedin_posts`: add `document_asset_id` (text, nullable) — stores LinkedIn's document URN after initializeUpload
2. Security
- No RLS policy changes — existing policies on linkedin_posts already cover the new columns.
*/

ALTER TABLE linkedin_posts ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE linkedin_posts ADD COLUMN IF NOT EXISTS video_asset_id text;
ALTER TABLE linkedin_posts ADD COLUMN IF NOT EXISTS document_url text;
ALTER TABLE linkedin_posts ADD COLUMN IF NOT EXISTS document_asset_id text;
