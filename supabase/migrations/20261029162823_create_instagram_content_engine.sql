/*
# Instagram content engine (plans, calendar, AI captions)

Mirrors the LinkedIn content engine for Instagram. Users build weekly plans of post slots,
assign plans to weeks on a timeline, and generate scheduled posts. A background writer creates
captions and picks photos from the media library; a publisher sends due posts to every account
chosen on the post through the existing Instagram posting pipeline.

1. New Tables
- `instagram_voice_samples` - writing samples that define the caption voice (name, content).
- `instagram_topics` - topic library (name, is_hidden, sort_order).
- `instagram_prompt_plans` - reusable weekly plans (name, description, active_days, account_ids = default accounts).
- `instagram_plan_slots` - one post per weekday/time in a plan: prompt_id (Instagram prompt from `prompts`),
  extra_instructions, topic_id, voice_sample_id, media_type (single/carousel), carousel_size,
  overlay_mode (none/ai/fixed), overlay_text, link_url (appended to the caption when publishing).
- `instagram_plan_assignments` - which plan is active from which week (start_week is a Monday).
- `instagram_skip_dates` - dates with no posts.
- `instagram_content_settings` - per-user timezone.
- `instagram_generation_jobs` - one row per "generate" run.
- `instagram_scheduled_posts` - planned posts: caption, hashtags, media (asset ids + urls), overlay text,
  account_ids, scheduled_for, status, generation_status, publish results and errors.

2. Modified Tables
- `instagram_post_variations` - new nullable `engine_post_id` linking a published copy to its planned post,
  with a unique index on (engine_post_id, account_id) so one planned post can never be posted twice to an account.

3. Functions
- `instagram_seed_default_topics()` - adds starter topics for a new user.
- `instagram_generate_weeks(start, end, replace)` - creates pending posts from the timeline.
- `instagram_claim_generation(limit)` - service only; claims posts for the caption writer.
- `instagram_claim_publish(limit)` - service only; atomically claims due posts for publishing.

4. Security
- RLS on every new table with separate owner-scoped select/insert/update/delete policies.
- Slots/assignments also require the referenced plan to belong to the user.
- Grants to authenticated (and service_role for background jobs). Claim functions executable by service_role only.

5. Important notes
1. No existing data is removed or changed; legacy scheduled posts keep publishing as before.
2. The web link is read from the slot at publish time, so editing a slot's link updates posts not yet published.
*/

CREATE TABLE IF NOT EXISTS instagram_voice_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instagram_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instagram_prompt_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled plan',
  description text NOT NULL DEFAULT '',
  active_days integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  account_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instagram_plan_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES instagram_prompt_plans(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  position integer NOT NULL DEFAULT 0,
  post_time time NOT NULL DEFAULT '09:00',
  prompt_id uuid REFERENCES prompts(id) ON DELETE SET NULL,
  extra_instructions text NOT NULL DEFAULT '',
  topic_id uuid REFERENCES instagram_topics(id) ON DELETE SET NULL,
  voice_sample_id uuid REFERENCES instagram_voice_samples(id) ON DELETE SET NULL,
  media_type text NOT NULL DEFAULT 'single' CHECK (media_type IN ('single', 'carousel')),
  carousel_size integer NOT NULL DEFAULT 3 CHECK (carousel_size BETWEEN 2 AND 10),
  overlay_mode text NOT NULL DEFAULT 'none' CHECK (overlay_mode IN ('none', 'ai', 'fixed')),
  overlay_text text NOT NULL DEFAULT '',
  link_url text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instagram_plan_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES instagram_prompt_plans(id) ON DELETE CASCADE,
  start_week date NOT NULL CHECK (extract(isodow FROM start_week) = 1),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, start_week)
);

CREATE TABLE IF NOT EXISTS instagram_skip_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  skip_date date NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, skip_date)
);

CREATE TABLE IF NOT EXISTS instagram_content_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instagram_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  start_week date NOT NULL,
  end_week date NOT NULL,
  total_posts integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instagram_scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES instagram_prompt_plans(id) ON DELETE SET NULL,
  slot_id uuid REFERENCES instagram_plan_slots(id) ON DELETE SET NULL,
  generation_job_id uuid REFERENCES instagram_generation_jobs(id) ON DELETE SET NULL,
  prompt_id uuid REFERENCES prompts(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES instagram_topics(id) ON DELETE SET NULL,
  topic_name text,
  voice_sample_id uuid REFERENCES instagram_voice_samples(id) ON DELETE SET NULL,
  week_start date,
  slot_date date,
  scheduled_for timestamptz NOT NULL,
  caption text NOT NULL DEFAULT '',
  hashtags text[] NOT NULL DEFAULT '{}',
  media_type text NOT NULL DEFAULT 'single' CHECK (media_type IN ('single', 'carousel')),
  carousel_size integer NOT NULL DEFAULT 1 CHECK (carousel_size BETWEEN 1 AND 10),
  media_asset_ids uuid[] NOT NULL DEFAULT '{}',
  media_urls text[] NOT NULL DEFAULT '{}',
  overlay_mode text NOT NULL DEFAULT 'none' CHECK (overlay_mode IN ('none', 'ai', 'fixed')),
  overlay_text text NOT NULL DEFAULT '',
  account_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'partial', 'failed')),
  generation_status text NOT NULL DEFAULT 'none' CHECK (generation_status IN ('none', 'pending', 'generating', 'done', 'failed')),
  generation_error text,
  generation_started_at timestamptz,
  publish_error text,
  publish_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_post_variations' AND column_name = 'engine_post_id') THEN
    ALTER TABLE instagram_post_variations
      ADD COLUMN engine_post_id uuid REFERENCES instagram_scheduled_posts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS instagram_post_variations_engine_account_unique
  ON instagram_post_variations (engine_post_id, account_id) WHERE engine_post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS instagram_scheduled_posts_slot_date_unique ON instagram_scheduled_posts (slot_id, slot_date) WHERE slot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS instagram_scheduled_posts_user_scheduled_idx ON instagram_scheduled_posts (user_id, scheduled_for);
CREATE INDEX IF NOT EXISTS instagram_scheduled_posts_generation_idx ON instagram_scheduled_posts (generation_status, scheduled_for) WHERE generation_status IN ('pending', 'generating');
CREATE INDEX IF NOT EXISTS instagram_scheduled_posts_publish_idx ON instagram_scheduled_posts (status, scheduled_for) WHERE status IN ('scheduled', 'publishing');
CREATE INDEX IF NOT EXISTS instagram_scheduled_posts_job_idx ON instagram_scheduled_posts (generation_job_id);
CREATE INDEX IF NOT EXISTS instagram_voice_samples_user_idx ON instagram_voice_samples (user_id);
CREATE INDEX IF NOT EXISTS instagram_topics_user_idx ON instagram_topics (user_id);
CREATE INDEX IF NOT EXISTS instagram_prompt_plans_user_idx ON instagram_prompt_plans (user_id);
CREATE INDEX IF NOT EXISTS instagram_plan_slots_plan_idx ON instagram_plan_slots (plan_id);
CREATE INDEX IF NOT EXISTS instagram_generation_jobs_user_idx ON instagram_generation_jobs (user_id, created_at);

ALTER TABLE instagram_voice_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_prompt_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_plan_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_skip_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_content_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_scheduled_posts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  instagram_voice_samples, instagram_topics, instagram_prompt_plans, instagram_plan_slots,
  instagram_plan_assignments, instagram_skip_dates, instagram_content_settings,
  instagram_generation_jobs, instagram_scheduled_posts
TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['instagram_voice_samples','instagram_topics','instagram_prompt_plans','instagram_skip_dates','instagram_content_settings','instagram_generation_jobs','instagram_scheduled_posts']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "select_own_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "select_own_%1$s" ON %1$I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS "insert_own_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "insert_own_%1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS "update_own_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "update_own_%1$s" ON %1$I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS "delete_own_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "delete_own_%1$s" ON %1$I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['instagram_plan_slots','instagram_plan_assignments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "select_own_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "select_own_%1$s" ON %1$I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS "insert_own_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "insert_own_%1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM instagram_prompt_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "update_own_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "update_own_%1$s" ON %1$I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM instagram_prompt_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "delete_own_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "delete_own_%1$s" ON %1$I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION instagram_seed_default_topics()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR EXISTS (SELECT 1 FROM instagram_topics WHERE user_id = uid) THEN
    RETURN;
  END IF;

  INSERT INTO instagram_topics (user_id, name, sort_order)
  SELECT uid, v.name, v.ord FROM unnest(ARRAY[
    'Behind the scenes','Customer success story','Quick tip','Myth vs fact','Day in the life',
    'Lessons learned','Product or service spotlight','Motivation Monday','Frequently asked question','Before and after',
    'Industry trend','Personal story','Tools we love','Mistakes to avoid','Wins of the week',
    'Community shoutout','How it works','Big announcement','Values and mission','Weekend inspiration'
  ]) WITH ORDINALITY AS v(name, ord);
END;
$$;

REVOKE ALL ON FUNCTION instagram_seed_default_topics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION instagram_seed_default_topics() TO authenticated;

CREATE OR REPLACE FUNCTION instagram_generate_weeks(p_start date, p_end date, p_replace boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  tz text;
  wk date;
  first_week date;
  last_week date;
  v_plan_id uuid;
  v_active integer[];
  v_accounts uuid[];
  s record;
  d date;
  ts timestamptz;
  job uuid;
  created integer := 0;
  n integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  first_week := p_start - ((extract(isodow FROM p_start)::int - 1));
  last_week := p_end - ((extract(isodow FROM p_end)::int - 1));
  IF last_week < first_week THEN
    RAISE EXCEPTION 'End week must be on or after start week';
  END IF;
  IF last_week > first_week + 371 THEN
    RAISE EXCEPTION 'You can generate up to 53 weeks at a time';
  END IF;

  SELECT timezone INTO tz FROM instagram_content_settings WHERE user_id = uid;
  tz := coalesce(tz, 'UTC');

  INSERT INTO instagram_generation_jobs (user_id, start_week, end_week)
  VALUES (uid, first_week, last_week) RETURNING id INTO job;

  IF p_replace THEN
    DELETE FROM instagram_scheduled_posts
    WHERE user_id = uid
      AND slot_id IS NOT NULL
      AND slot_date BETWEEN first_week AND last_week + 6
      AND status IN ('draft', 'scheduled', 'failed');
  END IF;

  wk := first_week;
  WHILE wk <= last_week LOOP
    SELECT a.plan_id, p.active_days, p.account_ids INTO v_plan_id, v_active, v_accounts
    FROM instagram_plan_assignments a
    JOIN instagram_prompt_plans p ON p.id = a.plan_id
    WHERE a.user_id = uid AND a.start_week <= wk
    ORDER BY a.start_week DESC
    LIMIT 1;

    IF v_plan_id IS NOT NULL THEN
      FOR s IN
        SELECT sl.*, t.name AS topic_label
        FROM instagram_plan_slots sl
        LEFT JOIN instagram_topics t ON t.id = sl.topic_id
        WHERE sl.plan_id = v_plan_id AND sl.day_of_week = ANY (v_active)
      LOOP
        d := wk + ((s.day_of_week + 6) % 7);
        ts := (d + s.post_time) AT TIME ZONE tz;
        CONTINUE WHEN ts <= now();
        CONTINUE WHEN EXISTS (SELECT 1 FROM instagram_skip_dates sd WHERE sd.user_id = uid AND sd.skip_date = d);

        INSERT INTO instagram_scheduled_posts (
          user_id, plan_id, slot_id, generation_job_id, prompt_id, topic_id, topic_name, voice_sample_id,
          week_start, slot_date, scheduled_for, media_type, carousel_size, overlay_mode, overlay_text,
          account_ids, status, generation_status
        ) VALUES (
          uid, v_plan_id, s.id, job, s.prompt_id, s.topic_id, s.topic_label, s.voice_sample_id,
          wk, d, ts, s.media_type, CASE WHEN s.media_type = 'carousel' THEN s.carousel_size ELSE 1 END,
          s.overlay_mode, CASE WHEN s.overlay_mode = 'fixed' THEN s.overlay_text ELSE '' END,
          coalesce(v_accounts, '{}'), 'scheduled', 'pending'
        )
        ON CONFLICT (slot_id, slot_date) WHERE slot_id IS NOT NULL DO NOTHING;

        GET DIAGNOSTICS n = ROW_COUNT;
        created := created + n;
      END LOOP;
    END IF;

    v_plan_id := NULL;
    v_accounts := NULL;
    wk := wk + 7;
  END LOOP;

  UPDATE instagram_generation_jobs SET total_posts = created WHERE id = job;

  RETURN jsonb_build_object('job_id', job, 'created', created);
END;
$$;

REVOKE ALL ON FUNCTION instagram_generate_weeks(date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION instagram_generate_weeks(date, date, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION instagram_claim_generation(p_limit integer)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE instagram_scheduled_posts
  SET generation_status = 'pending'
  WHERE generation_status = 'generating'
    AND generation_started_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH due AS (
    SELECT p.id
    FROM instagram_scheduled_posts p
    WHERE p.generation_status = 'pending'
    ORDER BY p.scheduled_for ASC
    LIMIT p_limit
    FOR UPDATE OF p SKIP LOCKED
  )
  UPDATE instagram_scheduled_posts sp
  SET generation_status = 'generating', generation_started_at = now(), generation_error = NULL
  FROM due
  WHERE sp.id = due.id
  RETURNING sp.id;
END;
$$;

REVOKE ALL ON FUNCTION instagram_claim_generation(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION instagram_claim_generation(integer) TO service_role;

CREATE OR REPLACE FUNCTION instagram_claim_publish(p_limit integer)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT p.id
    FROM instagram_scheduled_posts p
    WHERE p.status = 'scheduled'
      AND p.generation_status = 'done'
      AND p.scheduled_for <= now()
    ORDER BY p.scheduled_for ASC
    LIMIT p_limit
    FOR UPDATE OF p SKIP LOCKED
  )
  UPDATE instagram_scheduled_posts sp
  SET status = 'publishing', publish_error = NULL, updated_at = now()
  FROM due
  WHERE sp.id = due.id
  RETURNING sp.id;
END;
$$;

REVOKE ALL ON FUNCTION instagram_claim_publish(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION instagram_claim_publish(integer) TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['instagram_voice_samples','instagram_topics','instagram_prompt_plans','instagram_plan_slots','instagram_plan_assignments','instagram_skip_dates','instagram_content_settings','instagram_generation_jobs','instagram_scheduled_posts']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;