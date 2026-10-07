/*
# LinkedIn Analytics Snapshots Table

## Overview
Stores periodic snapshots of LinkedIn post analytics data. The LinkedIn API
provides engagement metrics (likes, comments, reactions, impressions, clicks,
shares, video views) per post, and these reset after 24 hours. By snapshotting
regularly, we can track metrics over time even as the API resets current values.

## New Table

### linkedin_analytics_snapshots
- user_id (uuid, owner, defaults to auth.uid())
- account_id (uuid, FK to linkedin_accounts, ON DELETE CASCADE)
- post_urn (text, the LinkedIn UGC post URN)
- impressions (integer, nullable — total impressions on the post)
- unique_impressions (integer, nullable — unique viewers)
- likes (integer, nullable — like count)
- comments (integer, nullable — comment count)
- shares (integer, nullable — share count)
- reactions_total (integer, nullable — total reactions including likes)
- clicks (integer, nullable — total clicks on the post)
- video_views (integer, nullable — video views if video post)
- engagement_rate (numeric, nullable — calculated engagement rate)
- post_permalink (text, nullable — link to the post on LinkedIn)
- post_content (text, nullable — first 200 chars of post text for display)
- snapshot_time (timestamptz, when this snapshot was taken — defaults to now())
- created_at (timestamptz)

Each snapshot is a point-in-time capture. Multiple snapshots per post are expected
so trends can be calculated. The edge function stores one snapshot per post per sync.

## Security
- RLS enabled.
- Owner-scoped CRUD policies using auth.uid() = user_id.
- user_id defaults to auth.uid() for frontend inserts.

## Indexes
- account_id for per-account lookups
- post_urn for per-post trend queries
- snapshot_time for time-based queries
- user_id for owner queries
*/

CREATE TABLE IF NOT EXISTS linkedin_analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES linkedin_accounts(id) ON DELETE CASCADE,
  post_urn text NOT NULL,
  impressions integer,
  unique_impressions integer,
  likes integer,
  comments integer,
  shares integer,
  reactions_total integer,
  clicks integer,
  video_views integer,
  engagement_rate numeric,
  post_permalink text,
  post_content text,
  snapshot_time timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE linkedin_analytics_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_linkedin_analytics" ON linkedin_analytics_snapshots;
CREATE POLICY "select_own_linkedin_analytics" ON linkedin_analytics_snapshots FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_linkedin_analytics" ON linkedin_analytics_snapshots;
CREATE POLICY "insert_own_linkedin_analytics" ON linkedin_analytics_snapshots FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_linkedin_analytics" ON linkedin_analytics_snapshots;
CREATE POLICY "update_own_linkedin_analytics" ON linkedin_analytics_snapshots FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_linkedin_analytics" ON linkedin_analytics_snapshots;
CREATE POLICY "delete_own_linkedin_analytics" ON linkedin_analytics_snapshots FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_analytics_account_id ON linkedin_analytics_snapshots (account_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_analytics_post_urn ON linkedin_analytics_snapshots (post_urn);
CREATE INDEX IF NOT EXISTS idx_linkedin_analytics_snapshot_time ON linkedin_analytics_snapshots (snapshot_time);
CREATE INDEX IF NOT EXISTS idx_linkedin_analytics_user_id ON linkedin_analytics_snapshots (user_id);