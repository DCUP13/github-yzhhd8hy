/*
# Create hooks table for social media content prompts

## Purpose
Users can save reusable "hooks" (opening lines / attention-grabbers) and insert them
into prompts for any social tool (Instagram, LinkedIn, Threads) via {{hooks}} (all hooks)
or {{hooks:Hook Name}} (a specific hook). The content engine edge functions will replace
these placeholders at generation time.

## New Tables
- `hooks`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, defaults to auth.uid(), references profiles, cascade delete)
  - `title` (text, not null) — short name shown in dropdowns
  - `content` (text, not null) — the hook text itself
  - `sort_order` (int, default 0) — for manual ordering
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Security
- RLS enabled on `hooks`.
- Grant CRUD to `authenticated` only (app requires sign-in).
- Owner-scoped: each user can only access their own hooks.
- Grant to `service_role` so edge functions can read hooks during generation.
*/

CREATE TABLE IF NOT EXISTS hooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE hooks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON hooks TO authenticated;
GRANT SELECT ON hooks TO service_role;

DROP POLICY IF EXISTS "select_own_hooks" ON hooks;
CREATE POLICY "select_own_hooks" ON hooks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_hooks" ON hooks;
CREATE POLICY "insert_own_hooks" ON hooks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_hooks" ON hooks;
CREATE POLICY "update_own_hooks" ON hooks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_hooks" ON hooks;
CREATE POLICY "delete_own_hooks" ON hooks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_hooks_user_id ON hooks(user_id);
