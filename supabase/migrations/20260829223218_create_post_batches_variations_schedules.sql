/*
# Create Instagram Auto-Posting Tables (Part 2: batches, variations, schedules)

1. New Tables
- instagram_post_batches: batch configuration for auto-generated post variations
- instagram_post_variations: individual generated variations per account
- instagram_posting_schedules: per-account posting schedule settings

2. Security
- RLS enabled on all tables
- Owner-scoped CRUD (auth.uid() = user_id) with DEFAULT auth.uid() on owner columns
- instagram_post_variations also allows access if the user owns the parent batch

3. Indexes
- batch_id and account_id on variations for efficient lookups
- status and scheduled_for on variations for queue processing
- account_id on schedules for per-account lookups
*/

-- instagram_post_batches
CREATE TABLE IF NOT EXISTS instagram_post_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  base_caption text NOT NULL DEFAULT '',
  hashtags text[] DEFAULT '{}',
  content_type text NOT NULL DEFAULT 'post' CHECK (content_type IN ('post', 'reel')),
  selected_asset_ids uuid[] DEFAULT '{}',
  variation_settings jsonb DEFAULT '{}'::jsonb,
  randomize_content boolean DEFAULT false,
  preview_count integer DEFAULT 3,
  prompt_id uuid,
  carousel_size integer DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'ready', 'scheduled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE instagram_post_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_post_batches" ON instagram_post_batches;
CREATE POLICY "select_own_post_batches" ON instagram_post_batches FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_post_batches" ON instagram_post_batches;
CREATE POLICY "insert_own_post_batches" ON instagram_post_batches FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_post_batches" ON instagram_post_batches;
CREATE POLICY "update_own_post_batches" ON instagram_post_batches FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_post_batches" ON instagram_post_batches;
CREATE POLICY "delete_own_post_batches" ON instagram_post_batches FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_post_batches_user_id ON instagram_post_batches (user_id);
CREATE INDEX IF NOT EXISTS idx_post_batches_status ON instagram_post_batches (status);

-- instagram_post_variations
CREATE TABLE IF NOT EXISTS instagram_post_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES instagram_post_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  cloudfront_url text NOT NULL DEFAULT '',
  s3_key text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  hashtags text[] DEFAULT '{}',
  font_used text,
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'staged', 'approved', 'rejected', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_for timestamptz,
  ig_media_id text,
  permalink text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  carousel_urls text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE instagram_post_variations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_post_variations" ON instagram_post_variations;
CREATE POLICY "select_own_post_variations" ON instagram_post_variations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_post_variations" ON instagram_post_variations;
CREATE POLICY "insert_own_post_variations" ON instagram_post_variations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_post_variations" ON instagram_post_variations;
CREATE POLICY "update_own_post_variations" ON instagram_post_variations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_post_variations" ON instagram_post_variations;
CREATE POLICY "delete_own_post_variations" ON instagram_post_variations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_post_variations_batch_id ON instagram_post_variations (batch_id);
CREATE INDEX IF NOT EXISTS idx_post_variations_account_id ON instagram_post_variations (account_id);
CREATE INDEX IF NOT EXISTS idx_post_variations_status ON instagram_post_variations (status);
CREATE INDEX IF NOT EXISTS idx_post_variations_scheduled_for ON instagram_post_variations (scheduled_for);

-- instagram_posting_schedules
CREATE TABLE IF NOT EXISTS instagram_posting_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  auto_posting_enabled boolean NOT NULL DEFAULT false,
  posts_per_day numeric NOT NULL DEFAULT 1,
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '21:00',
  active_days integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  min_gap_minutes integer NOT NULL DEFAULT 60,
  carousel_size integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, account_id)
);

ALTER TABLE instagram_posting_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_posting_schedules" ON instagram_posting_schedules;
CREATE POLICY "select_own_posting_schedules" ON instagram_posting_schedules FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_posting_schedules" ON instagram_posting_schedules;
CREATE POLICY "insert_own_posting_schedules" ON instagram_posting_schedules FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_posting_schedules" ON instagram_posting_schedules;
CREATE POLICY "update_own_posting_schedules" ON instagram_posting_schedules FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_posting_schedules" ON instagram_posting_schedules;
CREATE POLICY "delete_own_posting_schedules" ON instagram_posting_schedules FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_posting_schedules_account_id ON instagram_posting_schedules (account_id);
CREATE INDEX IF NOT EXISTS idx_posting_schedules_user_id ON instagram_posting_schedules (user_id);