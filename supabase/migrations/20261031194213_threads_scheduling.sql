/*
# Threads scheduling and posting

Adds everything needed to connect Threads profiles, plan weekly posting, write posts with AI,
publish them on schedule, optionally cross-post to Instagram, and track post stats.

1. New Tables
- `threads_accounts`: connected Threads profiles (threads_user_id, username, name, profile_picture_url,
  biography, followers_count, access_token, token_expires_at, connected, token_expired). The access
  token is never readable from the browser (column-level grant excludes it).
- `threads_voice_samples`: writing samples that set the tone (name, content).
- `threads_topics`: topic list (name, is_hidden, sort_order).
- `threads_prompt_plans`: weekly plans (name, description, active_days, account_ids = default Threads
  profiles, instagram_account_ids = default Instagram accounts for cross-posting).
- `threads_plan_slots`: one posting slot inside a plan (day_of_week, position, post_time, prompt_id,
  thread_prompt, extra_instructions, topic_id, voice_sample_id, link_id, photo_mode none|library|upload,
  photo_count, photo_urls, also_instagram).
- `threads_plan_assignments`: which plan runs from which Monday.
- `threads_skip_dates`: days with no posting.
- `threads_content_settings`: per-user timezone.
- `threads_generation_jobs`: a batch of weeks generated at once.
- `threads_links`: saved links that can be attached to posts.
- `threads_posts`: every Threads post (planned or composed) with text, photos, target profiles,
  Instagram cross-post choice, status, AI writing status, publish results per profile, and stats
  (views, likes, replies, reposts, quotes, shares).

2. Functions
- `threads_seed_default_topics()`: adds starter topics the first time (runs as the caller).
- `threads_generate_weeks(p_start, p_end, p_replace)`: creates posts from the assigned plans (runs as caller).
- `threads_claim_generation(int)` / `threads_claim_publish(int)`: background job helpers, server only.

3. Security
- RLS enabled on every table; separate select/insert/update/delete policies scoped to the owner.
- `threads_accounts`: users can read (without token) and delete their own profiles; only the server
  can insert/update.
- Claim functions are SECURITY DEFINER and executable only by service_role.

4. Notes
1. All tables are added to realtime so the screens update live.
2. Safe to re-run.
*/

CREATE TABLE IF NOT EXISTS threads_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  threads_user_id text NOT NULL,
  username text,
  name text,
  profile_picture_url text,
  biography text,
  followers_count integer,
  access_token text,
  token_expires_at timestamptz,
  connected boolean NOT NULL DEFAULT true,
  token_expired boolean NOT NULL DEFAULT false,
  last_refreshed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, threads_user_id)
);
CREATE INDEX IF NOT EXISTS threads_accounts_threads_user_idx ON threads_accounts (threads_user_id);

CREATE TABLE IF NOT EXISTS threads_voice_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS threads_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS threads_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  url text NOT NULL CHECK (url ~* '^https?://'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS threads_prompt_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'New plan',
  description text NOT NULL DEFAULT '',
  active_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  account_ids uuid[] NOT NULL DEFAULT '{}',
  instagram_account_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS threads_plan_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES threads_prompt_plans(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  position integer NOT NULL DEFAULT 0,
  post_time time NOT NULL DEFAULT '09:00',
  prompt_id uuid REFERENCES prompts(id) ON DELETE SET NULL,
  thread_prompt text NOT NULL DEFAULT '',
  extra_instructions text NOT NULL DEFAULT '',
  topic_id uuid REFERENCES threads_topics(id) ON DELETE SET NULL,
  voice_sample_id uuid REFERENCES threads_voice_samples(id) ON DELETE SET NULL,
  link_id uuid REFERENCES threads_links(id) ON DELETE SET NULL,
  photo_mode text NOT NULL DEFAULT 'none' CHECK (photo_mode IN ('none', 'library', 'upload')),
  photo_count integer NOT NULL DEFAULT 1 CHECK (photo_count BETWEEN 1 AND 10),
  photo_urls text[] NOT NULL DEFAULT '{}',
  also_instagram boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS threads_plan_slots_plan_idx ON threads_plan_slots (plan_id);

CREATE TABLE IF NOT EXISTS threads_plan_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES threads_prompt_plans(id) ON DELETE CASCADE,
  start_week date NOT NULL CHECK (extract(isodow FROM start_week) = 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, start_week)
);

CREATE TABLE IF NOT EXISTS threads_skip_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  skip_date date NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, skip_date)
);

CREATE TABLE IF NOT EXISTS threads_content_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS threads_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  start_week date NOT NULL,
  end_week date NOT NULL,
  total_posts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS threads_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES threads_prompt_plans(id) ON DELETE SET NULL,
  slot_id uuid REFERENCES threads_plan_slots(id) ON DELETE SET NULL,
  generation_job_id uuid REFERENCES threads_generation_jobs(id) ON DELETE SET NULL,
  prompt_id uuid REFERENCES prompts(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES threads_topics(id) ON DELETE SET NULL,
  topic_name text,
  voice_sample_id uuid REFERENCES threads_voice_samples(id) ON DELETE SET NULL,
  week_start date,
  slot_date date,
  scheduled_for timestamptz,
  content_text text NOT NULL DEFAULT '',
  link_id uuid REFERENCES threads_links(id) ON DELETE SET NULL,
  photo_mode text NOT NULL DEFAULT 'none' CHECK (photo_mode IN ('none', 'library', 'upload')),
  photo_count integer NOT NULL DEFAULT 1 CHECK (photo_count BETWEEN 1 AND 10),
  media_urls text[] NOT NULL DEFAULT '{}',
  media_asset_ids uuid[] NOT NULL DEFAULT '{}',
  account_ids uuid[] NOT NULL DEFAULT '{}',
  also_instagram boolean NOT NULL DEFAULT false,
  instagram_account_ids uuid[] NOT NULL DEFAULT '{}',
  instagram_post_id uuid REFERENCES instagram_scheduled_posts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'partial', 'failed', 'deleted')),
  generation_status text NOT NULL DEFAULT 'none' CHECK (generation_status IN ('none', 'pending', 'generating', 'done', 'failed')),
  generation_error text,
  generation_started_at timestamptz,
  publish_error text,
  publish_results jsonb NOT NULL DEFAULT '[]',
  published_at timestamptz,
  views integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  replies integer NOT NULL DEFAULT 0,
  reposts integer NOT NULL DEFAULT 0,
  quotes integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  insights_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS threads_posts_slot_date_uidx ON threads_posts (slot_id, slot_date) WHERE slot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS threads_posts_user_sched_idx ON threads_posts (user_id, scheduled_for);
CREATE INDEX IF NOT EXISTS threads_posts_due_idx ON threads_posts (status, generation_status, scheduled_for);

-- Grants
GRANT SELECT (id, user_id, threads_user_id, username, name, profile_picture_url, biography, followers_count,
  token_expires_at, connected, token_expired, last_refreshed_at, created_at, updated_at) ON threads_accounts TO authenticated;
GRANT DELETE ON threads_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  threads_voice_samples, threads_topics, threads_links, threads_prompt_plans, threads_plan_slots,
  threads_plan_assignments, threads_skip_dates, threads_content_settings, threads_generation_jobs, threads_posts
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  threads_accounts, threads_voice_samples, threads_topics, threads_links, threads_prompt_plans, threads_plan_slots,
  threads_plan_assignments, threads_skip_dates, threads_content_settings, threads_generation_jobs, threads_posts
  TO service_role;

-- RLS + owner policies
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['threads_accounts','threads_voice_samples','threads_topics','threads_links','threads_prompt_plans',
    'threads_plan_slots','threads_plan_assignments','threads_skip_dates','threads_content_settings','threads_generation_jobs','threads_posts']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "select_own" ON %I', t);
    EXECUTE format('CREATE POLICY "select_own" ON %I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS "delete_own" ON %I', t);
    EXECUTE format('CREATE POLICY "delete_own" ON %I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t);
    IF t <> 'threads_accounts' THEN
      EXECUTE format('DROP POLICY IF EXISTS "insert_own" ON %I', t);
      EXECUTE format('CREATE POLICY "insert_own" ON %I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t);
      EXECUTE format('DROP POLICY IF EXISTS "update_own" ON %I', t);
      EXECUTE format('CREATE POLICY "update_own" ON %I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    END IF;
  END LOOP;
END $$;

-- Slots must reference the caller's own plan
DROP POLICY IF EXISTS "insert_own" ON threads_plan_slots;
CREATE POLICY "insert_own" ON threads_plan_slots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM threads_prompt_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
DROP POLICY IF EXISTS "update_own" ON threads_plan_slots;
CREATE POLICY "update_own" ON threads_plan_slots FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM threads_prompt_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_own" ON threads_plan_assignments;
CREATE POLICY "insert_own" ON threads_plan_assignments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM threads_prompt_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
DROP POLICY IF EXISTS "update_own" ON threads_plan_assignments;
CREATE POLICY "update_own" ON threads_plan_assignments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM threads_prompt_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION threads_seed_default_topics()
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM threads_topics WHERE user_id = uid) THEN RETURN; END IF;
  INSERT INTO threads_topics (user_id, name, sort_order)
  SELECT uid, x.name, x.ord
  FROM unnest(ARRAY['Quick tip','Behind the scenes','Hot take','Question for followers','Lesson learned','Industry news','Personal story','Myth vs fact'])
    WITH ORDINALITY AS x(name, ord);
END $$;
REVOKE EXECUTE ON FUNCTION threads_seed_default_topics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION threads_seed_default_topics() TO authenticated;

CREATE OR REPLACE FUNCTION threads_generate_weeks(p_start date, p_end date, p_replace boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  tz text;
  wk date;
  first_week date;
  last_week date;
  v_plan_id uuid;
  v_active integer[];
  v_accounts uuid[];
  v_ig uuid[];
  s record;
  d date;
  ts timestamptz;
  job uuid;
  created integer := 0;
  n integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  first_week := p_start - ((extract(isodow FROM p_start)::int - 1));
  last_week := p_end - ((extract(isodow FROM p_end)::int - 1));
  IF last_week < first_week THEN RAISE EXCEPTION 'End week must be on or after start week'; END IF;
  IF last_week > first_week + 371 THEN RAISE EXCEPTION 'You can generate up to 53 weeks at a time'; END IF;

  SELECT timezone INTO tz FROM threads_content_settings WHERE user_id = uid;
  tz := coalesce(tz, 'UTC');

  INSERT INTO threads_generation_jobs (user_id, start_week, end_week) VALUES (uid, first_week, last_week) RETURNING id INTO job;

  IF p_replace THEN
    DELETE FROM threads_posts
    WHERE user_id = uid AND slot_id IS NOT NULL
      AND slot_date BETWEEN first_week AND last_week + 6
      AND status IN ('draft', 'scheduled', 'failed');
  END IF;

  wk := first_week;
  WHILE wk <= last_week LOOP
    SELECT a.plan_id, p.active_days, p.account_ids, p.instagram_account_ids INTO v_plan_id, v_active, v_accounts, v_ig
    FROM threads_plan_assignments a JOIN threads_prompt_plans p ON p.id = a.plan_id
    WHERE a.user_id = uid AND a.start_week <= wk
    ORDER BY a.start_week DESC LIMIT 1;

    IF v_plan_id IS NOT NULL THEN
      FOR s IN
        SELECT sl.*, t.name AS topic_label
        FROM threads_plan_slots sl LEFT JOIN threads_topics t ON t.id = sl.topic_id
        WHERE sl.plan_id = v_plan_id AND sl.day_of_week = ANY (v_active)
      LOOP
        d := wk + ((s.day_of_week + 6) % 7);
        ts := (d + s.post_time) AT TIME ZONE tz;
        CONTINUE WHEN ts <= now();
        CONTINUE WHEN EXISTS (SELECT 1 FROM threads_skip_dates sd WHERE sd.user_id = uid AND sd.skip_date = d);

        INSERT INTO threads_posts (
          user_id, plan_id, slot_id, generation_job_id, prompt_id, topic_id, topic_name, voice_sample_id,
          week_start, slot_date, scheduled_for, link_id, photo_mode, photo_count, media_urls,
          account_ids, also_instagram, instagram_account_ids, status, generation_status
        ) VALUES (
          uid, v_plan_id, s.id, job, s.prompt_id, s.topic_id, s.topic_label, s.voice_sample_id,
          wk, d, ts, s.link_id, s.photo_mode, s.photo_count,
          CASE WHEN s.photo_mode = 'upload' THEN s.photo_urls ELSE '{}' END,
          coalesce(v_accounts, '{}'), s.also_instagram, coalesce(v_ig, '{}'), 'scheduled', 'pending'
        )
        ON CONFLICT (slot_id, slot_date) WHERE slot_id IS NOT NULL DO NOTHING;
        GET DIAGNOSTICS n = ROW_COUNT;
        created := created + n;
      END LOOP;
    END IF;
    v_plan_id := NULL; v_accounts := NULL; v_ig := NULL;
    wk := wk + 7;
  END LOOP;

  UPDATE threads_generation_jobs SET total_posts = created WHERE id = job;
  RETURN jsonb_build_object('job_id', job, 'created', created);
END $$;
REVOKE EXECUTE ON FUNCTION threads_generate_weeks(date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION threads_generate_weeks(date, date, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION threads_claim_generation(p_limit integer)
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE threads_posts SET generation_status = 'pending', updated_at = now()
  WHERE generation_status = 'generating' AND generation_started_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH due AS (
    SELECT p.id FROM threads_posts p
    WHERE p.generation_status = 'pending' AND p.status IN ('draft', 'scheduled')
    ORDER BY p.scheduled_for ASC NULLS LAST
    LIMIT p_limit
    FOR UPDATE OF p SKIP LOCKED
  )
  UPDATE threads_posts tp SET generation_status = 'generating', generation_started_at = now(), generation_error = NULL, updated_at = now()
  FROM due WHERE tp.id = due.id
  RETURNING tp.id;
END $$;
REVOKE EXECUTE ON FUNCTION threads_claim_generation(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION threads_claim_generation(integer) TO service_role;

CREATE OR REPLACE FUNCTION threads_claim_publish(p_limit integer)
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE threads_posts SET status = 'scheduled', updated_at = now()
  WHERE status = 'publishing' AND updated_at < now() - interval '20 minutes' AND published_at IS NULL
    AND publish_results = '[]'::jsonb;

  RETURN QUERY
  WITH due AS (
    SELECT p.id FROM threads_posts p
    WHERE p.status = 'scheduled' AND p.generation_status IN ('done', 'none')
      AND p.scheduled_for <= now()
    ORDER BY p.scheduled_for ASC
    LIMIT p_limit
    FOR UPDATE OF p SKIP LOCKED
  )
  UPDATE threads_posts tp SET status = 'publishing', publish_error = NULL, updated_at = now()
  FROM due WHERE tp.id = due.id
  RETURNING tp.id;
END $$;
REVOKE EXECUTE ON FUNCTION threads_claim_publish(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION threads_claim_publish(integer) TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['threads_accounts','threads_voice_samples','threads_topics','threads_links','threads_prompt_plans',
    'threads_plan_slots','threads_plan_assignments','threads_skip_dates','threads_content_settings','threads_generation_jobs','threads_posts']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;
