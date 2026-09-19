/*
# Add Instagram media fields to post variations

1. Modified Tables
- `instagram_post_variations`
  - ADD `media_image_url` (text, nullable) — URL of the image/video as it appears on Instagram (from Graph API media_url or thumbnail_url)
  - ADD `media_type` (text, nullable) — Instagram media type (IMAGE, VIDEO, REEL, CAROUSEL_ALBUM)

2. Purpose
- When the "Sync Now" button polls Instagram, it updates each published variation with the real image URL and media type from Instagram's Graph API.
- This allows the Feed tab to display images sourced from Instagram rather than from S3/CloudFront.
- Variations whose posts have been deleted from Instagram are removed from the feed.

3. Security
- No RLS policy changes. Existing owner-scoped policies on `instagram_post_variations` still apply.
*/

ALTER TABLE instagram_post_variations
  ADD COLUMN IF NOT EXISTS media_image_url text,
  ADD COLUMN IF NOT EXISTS media_type text;
