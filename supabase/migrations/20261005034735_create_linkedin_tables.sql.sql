/*
# LinkedIn Integration: Accounts, Posts, and Posting Schedules

## Overview
This migration creates the database schema for the LinkedIn content scheduling
integration. It mirrors the Instagram auto-posting pattern with three tables:
linkedln accounts (OAuth connection), posts (drafted/scheduled/published content),
and posting schedules (recurring schedule settings). All tables use owner-scoped
Row Level Security.

## New Tables

### 1. linkedin_accounts
Stores the user's LinkedIn OAuth connection details.
- user_id (uuid, owner, defaults to auth.uid())
- access_token (text, LinkedIn OAuth access token)
- person_urn (text, LinkedIn Person URN e.g. "urn:li:person:XXXX" — required for posting)
- member_name (text, LinkedIn display name)
- member_email (text, LinkedIn email, nullable)
- profile_picture_url (text, nullable)
- connected (boolean, default true)
- token_expired (boolean, default false)
- created_at, updated_at (timestamps)

### 2. linkedin_posts
Stores drafted, scheduled, and published LinkedIn posts.
- user_id (uuid, owner, defaults to auth.uid())
- content_text (text, the post body / share commentary)
- article_url (text, optional URL for article/link shares)
- article_title (text, optional custom title for link preview)
- article_description (text, optional custom description for link preview)
- image_url (text, optional CloudFront URL of uploaded image)
- image_asset_id (uuid, optional FK to media_assets)
- visibility (text, "PUBLIC" or "CONNECTIONS", default "PUBLIC")
- status (text, "draft", "scheduled", "publishing", "published", "failed")
- scheduled_for (timestamptz, when the post should go live, nullable)
- linkedin_post_urn (text, LinkedIn post URN after publishing, nullable)
- permalink (text, LinkedIn permalink after publishing, nullable)
- error_message (text, failure details, nullable)
- retry_count (integer, default 0)
- created_at, updated_at (timestamps)

### 3. linkedin_posting_schedules
Per-user recurring posting schedule settings.
- user_id (uuid, owner, defaults to auth.uid())
- auto_posting_enabled (boolean, default false)
- posts_per_day (numeric, default 1)
- start_time (time, default 09:00)
- end_time (time, default 17:00)
- active_days (integer array, 0=Sun..6=Sat, default all days)
- created_at, updated_at (timestamps)
- UNIQUE constraint on (user_id)

## Security
- RLS enabled on all tables.
- Owner-scoped CRUD policies (select, insert, update, delete) using auth.uid() = user_id.
- All owner columns default to auth.uid() so inserts from the frontend work without
  explicitly passing user_id.

## Indexes
- linkedin_posts: user_id for listing posts, status for queue processing,
  scheduled_for for the queue processor
- linkedin_accounts: user_id for lookups
- linkedin_posting_schedules: user_id for lookups
*/

-- linkedin_accounts
CREATE TABLE IF NOT EXISTS linkedin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  person_urn text NOT NULL,
  member_name text NOT NULL DEFAULT '',
  member_email text,
  profile_picture_url text,
  connected boolean NOT NULL DEFAULT true,
  token_expired boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE linkedin_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_linkedin_accounts" ON linkedin_accounts;
CREATE POLICY "select_own_linkedin_accounts" ON linkedin_accounts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_linkedin_accounts" ON linkedin_accounts;
CREATE POLICY "insert_own_linkedin_accounts" ON linkedin_accounts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_linkedin_accounts" ON linkedin_accounts;
CREATE POLICY "update_own_linkedin_accounts" ON linkedin_accounts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_linkedin_accounts" ON linkedin_accounts;
CREATE POLICY "delete_own_linkedin_accounts" ON linkedin_accounts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_user_id ON linkedin_accounts (user_id);

-- linkedin_posts
CREATE TABLE IF NOT EXISTS linkedin_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content_text text NOT NULL DEFAULT '',
  article_url text,
  article_title text,
  article_description text,
  image_url text,
  image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'CONNECTIONS')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_for timestamptz,
  linkedin_post_urn text,
  permalink text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE linkedin_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_linkedin_posts" ON linkedin_posts;
CREATE POLICY "select_own_linkedin_posts" ON linkedin_posts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_linkedin_posts" ON linkedin_posts;
CREATE POLICY "insert_own_linkedin_posts" ON linkedin_posts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_linkedin_posts" ON linkedin_posts;
CREATE POLICY "update_own_linkedin_posts" ON linkedin_posts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_linkedin_posts" ON linkedin_posts;
CREATE POLICY "delete_own_linkedin_posts" ON linkedin_posts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_posts_user_id ON linkedin_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_status ON linkedin_posts (status);
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_scheduled_for ON linkedin_posts (scheduled_for);

-- linkedin_posting_schedules
CREATE TABLE IF NOT EXISTS linkedin_posting_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_posting_enabled boolean NOT NULL DEFAULT false,
  posts_per_day numeric NOT NULL DEFAULT 1,
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '17:00',
  active_days integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE linkedin_posting_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_linkedin_posting_schedules" ON linkedin_posting_schedules;
CREATE POLICY "select_own_linkedin_posting_schedules" ON linkedin_posting_schedules FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_linkedin_posting_schedules" ON linkedin_posting_schedules;
CREATE POLICY "insert_own_linkedin_posting_schedules" ON linkedin_posting_schedules FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_linkedin_posting_schedules" ON linkedin_posting_schedules;
CREATE POLICY "update_own_linkedin_posting_schedules" ON linkedin_posting_schedules FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_linkedin_posting_schedules" ON linkedin_posting_schedules;
CREATE POLICY "delete_own_linkedin_posting_schedules" ON linkedin_posting_schedules FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_posting_schedules_user_id ON linkedin_posting_schedules (user_id);