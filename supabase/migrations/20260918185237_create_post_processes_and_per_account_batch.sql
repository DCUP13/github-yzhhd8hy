/*
# Create Post Processes table and add per-account batch support

1. New Tables
- `instagram_post_processes`: Saved post creation templates that capture all
  settings (content type, carousel, caption, hashtags, variation toggles,
  AI prompt mode/selection, post-now flag) so they can be reused across
  batches and assigned to specific accounts.

2. Modified Tables
- `instagram_post_batches`: Add `account_assignments` jsonb column to store
  per-account settings (which process to use, schedule time, post-now per
  account) when creating a batch for multiple accounts.

3. Security
- RLS enabled on `instagram_post_processes`.
- Owner-scoped CRUD (auth.uid() = user_id) with DEFAULT auth.uid() on owner column.
- `instagram_post_batches` already has RLS and owner-scoped policies; the new
  column is covered by existing policies.
*/

-- instagram_post_processes
CREATE TABLE IF NOT EXISTS instagram_post_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  content_type text NOT NULL DEFAULT 'post' CHECK (content_type IN ('post', 'reel')),
  carousel_size integer NOT NULL DEFAULT 1,
  carousel_text_lines text[] DEFAULT '{}',
  base_caption text NOT NULL DEFAULT '',
  hashtags text[] DEFAULT '{}',
  variation_settings jsonb DEFAULT '{}'::jsonb,
  randomize_content boolean DEFAULT true,
  prompt_mode text NOT NULL DEFAULT 'none' CHECK (prompt_mode IN ('none', 'select', 'custom')),
  prompt_id uuid,
  custom_prompt text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE instagram_post_processes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_post_processes" ON instagram_post_processes;
CREATE POLICY "select_own_post_processes" ON instagram_post_processes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_post_processes" ON instagram_post_processes;
CREATE POLICY "insert_own_post_processes" ON instagram_post_processes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_post_processes" ON instagram_post_processes;
CREATE POLICY "update_own_post_processes" ON instagram_post_processes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_post_processes" ON instagram_post_processes;
CREATE POLICY "delete_own_post_processes" ON instagram_post_processes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_post_processes_user_id ON instagram_post_processes (user_id);

-- Add account_assignments column to instagram_post_batches
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'instagram_post_batches' AND column_name = 'account_assignments'
  ) THEN
    ALTER TABLE instagram_post_batches ADD COLUMN account_assignments jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;