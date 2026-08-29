/*
# Create Instagram Auto-Posting Tables (Part 1: media_storage_config + media_assets)

1. New Tables
- media_storage_config: CloudFront domain + bucket name per user
- media_assets: uploaded library file metadata with transcript support

2. Security
- RLS enabled on both tables
- Owner-scoped CRUD (auth.uid() = user_id) with DEFAULT auth.uid() on owner columns
*/

-- media_storage_config
CREATE TABLE IF NOT EXISTS media_storage_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  cloudfront_domain text NOT NULL,
  bucket_name text NOT NULL,
  bucket_region text DEFAULT 'us-east-1',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE media_storage_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_storage_config" ON media_storage_config;
CREATE POLICY "select_own_storage_config" ON media_storage_config FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_storage_config" ON media_storage_config;
CREATE POLICY "insert_own_storage_config" ON media_storage_config FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_storage_config" ON media_storage_config;
CREATE POLICY "update_own_storage_config" ON media_storage_config FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_storage_config" ON media_storage_config;
CREATE POLICY "delete_own_storage_config" ON media_storage_config FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- media_assets
CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  s3_key text NOT NULL,
  cloudfront_url text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('image', 'video')),
  file_size bigint DEFAULT 0,
  mime_type text,
  duration_seconds integer,
  transcript text,
  width integer,
  height integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_media_assets" ON media_assets;
CREATE POLICY "select_own_media_assets" ON media_assets FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_media_assets" ON media_assets;
CREATE POLICY "insert_own_media_assets" ON media_assets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_media_assets" ON media_assets;
CREATE POLICY "update_own_media_assets" ON media_assets FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_media_assets" ON media_assets;
CREATE POLICY "delete_own_media_assets" ON media_assets FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_media_assets_user_id ON media_assets (user_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets (created_at DESC);