/*
# Instagram Multi-Account, Insights Snapshots, and Auto-Refresh Settings

## Purpose
Extends the Instagram integration to support multiple connected accounts per user,
store periodic insight snapshots for trend tracking, and persist per-user
auto-refresh configuration.

## Changes

### 1. instagram_accounts — new columns
- auth_method (text, default 'manual') — 'manual' or 'oauth'
- profile_picture_url (text) — profile pic from Graph API
- follows_count (int) — number of accounts this user follows
- followers_count (int) — follower count
- media_count (int) — total media count
- token_expired (boolean, default false) — set when token is invalid/expired

### 2. New table: instagram_insights_snapshots
Stores one snapshot per account per sync. Each row captures account-level
metrics and a JSONB blob of per-post metrics at that point in time, enabling
trend charts over time.
- id (uuid PK)
- account_id (uuid FK -> instagram_accounts, cascade delete)
- user_id (uuid, owner, defaults to auth.uid())
- followers_count (int)
- follows_count (int)
- media_count (int)
- account_reach (int, nullable)
- account_impressions (int, nullable)
- engagement_rate (numeric, nullable)
- posts_data (jsonb) — array of {media_id, caption, permalink, thumbnail_url, like_count, comments_count, reach, impressions, saved, video_views, timestamp}
- created_at (timestamptz, default now())

### 3. New table: instagram_refresh_settings
Per-user auto-refresh configuration.
- id (uuid PK)
- user_id (uuid, unique, defaults to auth.uid(), FK -> auth.users)
- auto_refresh_enabled (boolean, default false)
- refresh_interval_hours (int, default 6) — 1, 6, 12, or 24
- last_refresh_at (timestamptz, nullable)
- created_at / updated_at (timestamptz)

### 4. Realtime publications
Adds instagram_insights_snapshots, instagram_refresh_settings, and
instagram_webhook_events to the supabase_realtime publication for live UI updates.

### 5. Security
- RLS enabled on both new tables.
- Owner-scoped CRUD policies (user_id defaults to auth.uid()).
- Shared users can read snapshots for accounts shared with them.

### 6. Index
- instagram_insights_snapshots on (account_id, created_at DESC)
- instagram_refresh_settings on (user_id)
*/

-- 1. Add columns to instagram_accounts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_accounts' AND column_name = 'auth_method') THEN
    ALTER TABLE instagram_accounts ADD COLUMN auth_method text NOT NULL DEFAULT 'manual';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_accounts' AND column_name = 'profile_picture_url') THEN
    ALTER TABLE instagram_accounts ADD COLUMN profile_picture_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_accounts' AND column_name = 'follows_count') THEN
    ALTER TABLE instagram_accounts ADD COLUMN follows_count int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_accounts' AND column_name = 'followers_count') THEN
    ALTER TABLE instagram_accounts ADD COLUMN followers_count int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_accounts' AND column_name = 'media_count') THEN
    ALTER TABLE instagram_accounts ADD COLUMN media_count int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_accounts' AND column_name = 'token_expired') THEN
    ALTER TABLE instagram_accounts ADD COLUMN token_expired boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Create instagram_insights_snapshots
CREATE TABLE IF NOT EXISTS instagram_insights_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  followers_count int,
  follows_count int,
  media_count int,
  account_reach int,
  account_impressions int,
  engagement_rate numeric,
  posts_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE instagram_insights_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ig_snapshots" ON instagram_insights_snapshots;
CREATE POLICY "select_own_ig_snapshots" ON instagram_insights_snapshots FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ig_snapshots" ON instagram_insights_snapshots;
CREATE POLICY "insert_own_ig_snapshots" ON instagram_insights_snapshots FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_ig_snapshots" ON instagram_insights_snapshots;
CREATE POLICY "update_own_ig_snapshots" ON instagram_insights_snapshots FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_ig_snapshots" ON instagram_insights_snapshots;
CREATE POLICY "delete_own_ig_snapshots" ON instagram_insights_snapshots FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Allow shared users to read snapshots for shared accounts
DROP POLICY IF EXISTS "select_shared_ig_snapshots" ON instagram_insights_snapshots;
CREATE POLICY "select_shared_ig_snapshots" ON instagram_insights_snapshots FOR SELECT
  TO authenticated USING (public.has_ig_share(account_id));

CREATE INDEX IF NOT EXISTS idx_ig_snapshots_account_created
  ON instagram_insights_snapshots (account_id, created_at DESC);

-- 3. Create instagram_refresh_settings
CREATE TABLE IF NOT EXISTS instagram_refresh_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_refresh_enabled boolean NOT NULL DEFAULT false,
  refresh_interval_hours int NOT NULL DEFAULT 6,
  last_refresh_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE instagram_refresh_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ig_refresh_settings" ON instagram_refresh_settings;
CREATE POLICY "select_own_ig_refresh_settings" ON instagram_refresh_settings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ig_refresh_settings" ON instagram_refresh_settings;
CREATE POLICY "insert_own_ig_refresh_settings" ON instagram_refresh_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_ig_refresh_settings" ON instagram_refresh_settings;
CREATE POLICY "update_own_ig_refresh_settings" ON instagram_refresh_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_ig_refresh_settings" ON instagram_refresh_settings;
CREATE POLICY "delete_own_ig_refresh_settings" ON instagram_refresh_settings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ig_refresh_settings_user
  ON instagram_refresh_settings (user_id);

-- 4. Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_insights_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_refresh_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_webhook_events;