/*
# Create faqs table for business FAQ management

1. New Tables
- `faqs`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, defaults to auth.uid(), references auth.users)
  - `question` (text, not null) — the FAQ question
  - `answer` (text, not null) — the FAQ answer
  - `sort_order` (integer, default 0) — ordering for display
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on `faqs`.
- Grant CRUD to `authenticated` only (app requires sign-in).
- Owner-scoped CRUD: each authenticated user can only access their own FAQs.
- `user_id` defaults to `auth.uid()` so inserts work even when client omits it.

3. Usage
- The `{{faq}}` placeholder in prompts will be replaced with a formatted
  concatenation of all the user's FAQs (Q: ... A: ...) by edge functions
  at generation time.
*/

CREATE TABLE IF NOT EXISTS faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON faqs TO authenticated;

DROP POLICY IF EXISTS "select_own_faqs" ON faqs;
CREATE POLICY "select_own_faqs" ON faqs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_faqs" ON faqs;
CREATE POLICY "insert_own_faqs" ON faqs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_faqs" ON faqs;
CREATE POLICY "update_own_faqs" ON faqs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_faqs" ON faqs;
CREATE POLICY "delete_own_faqs" ON faqs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
