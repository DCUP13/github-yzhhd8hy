/*
# LinkedIn Content Engine

Adds everything needed to plan, AI-generate, review and auto-publish a year of LinkedIn posts.

1. New Tables
- `linkedin_voice_samples` - example posts that define the writing voice (name, content).
- `linkedin_topics` - topic library. `category` is mindset | topical | research; `name`; `is_hidden`; `sort_order`.
- `linkedin_prompt_plans` - a reusable weekly blueprint (name, description, `active_days` 0=Sun..6=Sat).
- `linkedin_plan_slots` - one posting slot inside a plan: `day_of_week`, `post_time`, `position`, `category`,
  `topic_id`, `voice_sample_id`, `prompt`, `guide_mode` (none | ai | upload), `guide_length` (short | medium | long),
  `guide_prompt`, `upload_document_url`, `upload_document_name`.
- `linkedin_plan_assignments` - timeline: plan X takes effect from week `start_week` (a Monday) until the next assignment.
- `linkedin_skip_dates` - dates on which nothing is generated or posted.
- `linkedin_content_settings` - per-user `timezone` and `research_lead_days`.
- `linkedin_generation_jobs` - record of each "generate weeks" request (range + total posts created).

2. Modified Tables
- `linkedin_posts` gains planning/generation columns: plan_id, slot_id, generation_job_id, category, topic_id,
  topic_name, voice_sample_id, week_start, slot_date, generation_status (none | pending | generating | done | failed),
  generation_error, generation_started_at, generation_prompt, guide_mode, guide_length, guide_prompt,
  needs_review, reviewed_at, research_summary, research_sources, research_subreddits, document_name.
  Settings are copied onto each post so later plan edits never change already-generated weeks.

3. Functions
- `linkedin_seed_default_topics()` - inserts 25 default entries per category for the calling user (once).
- `linkedin_generate_weeks(start, end, replace)` - expands plans into placeholder posts for a range of weeks
  (respects active days, skip dates, timezone); runs as the caller so RLS applies.
- `linkedin_claim_generation(limit)` - service-only; atomically claims due posts for the background writer.

4. Security
- RLS enabled on every new table; owner-scoped select/insert/update/delete for authenticated users.
- Child rows (slots, assignments) also require the referenced plan to belong to the user.
- Claim function is SECURITY DEFINER and executable by service_role only.
*/

CREATE TABLE IF NOT EXISTS linkedin_voice_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS linkedin_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('mindset', 'topical', 'research')),
  name text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS linkedin_prompt_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled plan',
  description text NOT NULL DEFAULT '',
  active_days integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS linkedin_plan_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES linkedin_prompt_plans(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  position integer NOT NULL DEFAULT 0,
  post_time time NOT NULL DEFAULT '09:00',
  category text NOT NULL DEFAULT 'mindset' CHECK (category IN ('mindset', 'topical', 'research')),
  topic_id uuid REFERENCES linkedin_topics(id) ON DELETE SET NULL,
  voice_sample_id uuid REFERENCES linkedin_voice_samples(id) ON DELETE SET NULL,
  prompt text NOT NULL DEFAULT '',
  guide_mode text NOT NULL DEFAULT 'none' CHECK (guide_mode IN ('none', 'ai', 'upload')),
  guide_length text NOT NULL DEFAULT 'medium' CHECK (guide_length IN ('short', 'medium', 'long')),
  guide_prompt text NOT NULL DEFAULT '',
  upload_document_url text,
  upload_document_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT research_slots_no_upload CHECK (category <> 'research' OR guide_mode <> 'upload')
);

CREATE TABLE IF NOT EXISTS linkedin_plan_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES linkedin_prompt_plans(id) ON DELETE CASCADE,
  start_week date NOT NULL CHECK (extract(isodow FROM start_week) = 1),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, start_week)
);

CREATE TABLE IF NOT EXISTS linkedin_skip_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  skip_date date NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, skip_date)
);

CREATE TABLE IF NOT EXISTS linkedin_content_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  research_lead_days integer NOT NULL DEFAULT 3 CHECK (research_lead_days BETWEEN 0 AND 30),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS linkedin_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  start_week date NOT NULL,
  end_week date NOT NULL,
  total_posts integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'linkedin_posts' AND column_name = 'generation_status') THEN
    ALTER TABLE linkedin_posts
      ADD COLUMN plan_id uuid REFERENCES linkedin_prompt_plans(id) ON DELETE SET NULL,
      ADD COLUMN slot_id uuid REFERENCES linkedin_plan_slots(id) ON DELETE SET NULL,
      ADD COLUMN generation_job_id uuid REFERENCES linkedin_generation_jobs(id) ON DELETE SET NULL,
      ADD COLUMN category text CHECK (category IS NULL OR category IN ('mindset', 'topical', 'research')),
      ADD COLUMN topic_id uuid REFERENCES linkedin_topics(id) ON DELETE SET NULL,
      ADD COLUMN topic_name text,
      ADD COLUMN voice_sample_id uuid REFERENCES linkedin_voice_samples(id) ON DELETE SET NULL,
      ADD COLUMN week_start date,
      ADD COLUMN slot_date date,
      ADD COLUMN generation_status text NOT NULL DEFAULT 'none' CHECK (generation_status IN ('none', 'pending', 'generating', 'done', 'failed')),
      ADD COLUMN generation_error text,
      ADD COLUMN generation_started_at timestamptz,
      ADD COLUMN generation_prompt text,
      ADD COLUMN guide_mode text NOT NULL DEFAULT 'none' CHECK (guide_mode IN ('none', 'ai', 'upload')),
      ADD COLUMN guide_length text NOT NULL DEFAULT 'medium' CHECK (guide_length IN ('short', 'medium', 'long')),
      ADD COLUMN guide_prompt text,
      ADD COLUMN needs_review boolean NOT NULL DEFAULT false,
      ADD COLUMN reviewed_at timestamptz,
      ADD COLUMN research_summary text,
      ADD COLUMN research_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN research_subreddits text[] NOT NULL DEFAULT '{}',
      ADD COLUMN document_name text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS linkedin_posts_slot_date_unique ON linkedin_posts (slot_id, slot_date) WHERE slot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS linkedin_posts_user_scheduled_idx ON linkedin_posts (user_id, scheduled_for);
CREATE INDEX IF NOT EXISTS linkedin_posts_generation_idx ON linkedin_posts (generation_status, scheduled_for) WHERE generation_status IN ('pending', 'generating');
CREATE INDEX IF NOT EXISTS linkedin_posts_job_idx ON linkedin_posts (generation_job_id);
CREATE INDEX IF NOT EXISTS linkedin_voice_samples_user_idx ON linkedin_voice_samples (user_id);
CREATE INDEX IF NOT EXISTS linkedin_topics_user_idx ON linkedin_topics (user_id, category);
CREATE INDEX IF NOT EXISTS linkedin_prompt_plans_user_idx ON linkedin_prompt_plans (user_id);
CREATE INDEX IF NOT EXISTS linkedin_plan_slots_plan_idx ON linkedin_plan_slots (plan_id);
CREATE INDEX IF NOT EXISTS linkedin_generation_jobs_user_idx ON linkedin_generation_jobs (user_id, created_at);

ALTER TABLE linkedin_voice_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_prompt_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_plan_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_skip_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_content_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Simple owner-scoped tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['linkedin_voice_samples','linkedin_topics','linkedin_prompt_plans','linkedin_skip_dates','linkedin_content_settings','linkedin_generation_jobs']
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

-- Tables that reference a plan: require the plan to be owned by the user too
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['linkedin_plan_slots','linkedin_plan_assignments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "select_own_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "select_own_%1$s" ON %1$I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS "insert_own_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "insert_own_%1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM linkedin_prompt_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "update_own_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "update_own_%1$s" ON %1$I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM linkedin_prompt_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "delete_own_%1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "delete_own_%1$s" ON %1$I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION linkedin_seed_default_topics()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR EXISTS (SELECT 1 FROM linkedin_topics WHERE user_id = uid) THEN
    RETURN;
  END IF;

  INSERT INTO linkedin_topics (user_id, category, name, sort_order)
  SELECT uid, 'mindset', v.name, v.ord FROM unnest(ARRAY[
    'Embracing failure as feedback','Consistency over intensity','The growth mindset in business','Discipline beats motivation',
    'Overcoming imposter syndrome','Long-term thinking','Ownership and accountability','Resilience after setbacks',
    'Focus in a world of distractions','Taking imperfect action','Learning from rejection','Gratitude as a competitive edge',
    'Building confidence through reps','Comfort zone vs growth zone','Patience in building something great','Abundance vs scarcity mindset',
    'Self-awareness as a leader','Saying no to protect priorities','Curiosity as a career superpower','Detaching identity from outcomes',
    'Playing the long game in relationships','Turning fear into fuel','Habits that compound','Leading by example','Progress over perfection'
  ]) WITH ORDINALITY AS v(name, ord);

  INSERT INTO linkedin_topics (user_id, category, name, sort_order)
  SELECT uid, 'topical', v.name, v.ord FROM unnest(ARRAY[
    'AI tools for small business productivity','Using AI for content creation','AI-driven customer service','Prompt engineering for marketers',
    'Automating sales outreach with AI','AI in lead generation','Personal branding on LinkedIn','Content marketing strategy',
    'Building a marketing funnel','Email marketing that converts','Data-driven decision making','AI and the future of work',
    'Ethical use of AI in business','Marketing automation workflows','Customer retention strategies','Pricing strategy',
    'Storytelling in marketing','Building a referral engine','Scaling a service business','Delegating and hiring with AI support',
    'AI for market research','Video marketing on social media','Community-led growth','Measuring marketing ROI','Positioning and differentiation'
  ]) WITH ORDINALITY AS v(name, ord);

  INSERT INTO linkedin_topics (user_id, category, name, sort_order)
  SELECT uid, 'research', v.name, v.ord FROM unnest(ARRAY[
    'AI tools for small business','ChatGPT for marketing','Cold email outreach','LinkedIn growth strategies',
    'Startup fundraising','Remote work productivity','Freelancing and consulting','SaaS growth',
    'Content creation workflows','SEO in the age of AI','E-commerce trends','Sales prospecting',
    'Personal finance for entrepreneurs','Customer acquisition cost','Founder burnout and mental health','No-code automation',
    'Hiring challenges','Side hustles','Copywriting techniques','Paid ads performance',
    'AI agents and automation','Brand building','Pricing a service business','Networking and partnerships','Productivity systems'
  ]) WITH ORDINALITY AS v(name, ord);
END;
$$;

REVOKE ALL ON FUNCTION linkedin_seed_default_topics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION linkedin_seed_default_topics() TO authenticated;

CREATE OR REPLACE FUNCTION linkedin_generate_weeks(p_start date, p_end date, p_replace boolean DEFAULT false)
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

  SELECT timezone INTO tz FROM linkedin_content_settings WHERE user_id = uid;
  tz := coalesce(tz, 'UTC');

  INSERT INTO linkedin_generation_jobs (user_id, start_week, end_week)
  VALUES (uid, first_week, last_week) RETURNING id INTO job;

  IF p_replace THEN
    DELETE FROM linkedin_posts
    WHERE user_id = uid
      AND generation_status <> 'none'
      AND slot_date BETWEEN first_week AND last_week + 6
      AND status IN ('draft', 'scheduled', 'failed');
  END IF;

  wk := first_week;
  WHILE wk <= last_week LOOP
    SELECT a.plan_id, p.active_days INTO v_plan_id, v_active
    FROM linkedin_plan_assignments a
    JOIN linkedin_prompt_plans p ON p.id = a.plan_id
    WHERE a.user_id = uid AND a.start_week <= wk
    ORDER BY a.start_week DESC
    LIMIT 1;

    IF v_plan_id IS NOT NULL THEN
      FOR s IN
        SELECT sl.*, t.name AS topic_label
        FROM linkedin_plan_slots sl
        LEFT JOIN linkedin_topics t ON t.id = sl.topic_id
        WHERE sl.plan_id = v_plan_id AND sl.day_of_week = ANY (v_active)
      LOOP
        d := wk + ((s.day_of_week + 6) % 7);
        ts := (d + s.post_time) AT TIME ZONE tz;
        CONTINUE WHEN ts <= now();
        CONTINUE WHEN EXISTS (SELECT 1 FROM linkedin_skip_dates sd WHERE sd.user_id = uid AND sd.skip_date = d);

        INSERT INTO linkedin_posts (
          user_id, content_text, status, scheduled_for, plan_id, slot_id, generation_job_id, category,
          topic_id, topic_name, voice_sample_id, week_start, slot_date, generation_status, generation_prompt,
          guide_mode, guide_length, guide_prompt, needs_review, document_url, document_name
        ) VALUES (
          uid, '', 'draft', ts, v_plan_id, s.id, job, s.category,
          s.topic_id, s.topic_label, s.voice_sample_id, wk, d, 'pending', s.prompt,
          s.guide_mode, s.guide_length, s.guide_prompt, s.category = 'research',
          CASE WHEN s.guide_mode = 'upload' THEN s.upload_document_url END,
          CASE WHEN s.guide_mode = 'upload' THEN s.upload_document_name END
        )
        ON CONFLICT (slot_id, slot_date) WHERE slot_id IS NOT NULL DO NOTHING;

        GET DIAGNOSTICS n = ROW_COUNT;
        created := created + n;
      END LOOP;
    END IF;

    v_plan_id := NULL;
    wk := wk + 7;
  END LOOP;

  UPDATE linkedin_generation_jobs SET total_posts = created WHERE id = job;

  RETURN jsonb_build_object('job_id', job, 'created', created);
END;
$$;

REVOKE ALL ON FUNCTION linkedin_generate_weeks(date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION linkedin_generate_weeks(date, date, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION linkedin_claim_generation(p_limit integer)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE linkedin_posts
  SET generation_status = 'pending'
  WHERE generation_status = 'generating'
    AND generation_started_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH due AS (
    SELECT p.id
    FROM linkedin_posts p
    LEFT JOIN linkedin_content_settings cs ON cs.user_id = p.user_id
    WHERE p.generation_status = 'pending'
      AND (
        p.category IS DISTINCT FROM 'research'
        OR p.scheduled_for <= now() + make_interval(days => coalesce(cs.research_lead_days, 3))
      )
    ORDER BY p.scheduled_for ASC NULLS LAST
    LIMIT p_limit
    FOR UPDATE OF p SKIP LOCKED
  )
  UPDATE linkedin_posts lp
  SET generation_status = 'generating', generation_started_at = now(), generation_error = NULL
  FROM due
  WHERE lp.id = due.id
  RETURNING lp.id;
END;
$$;

REVOKE ALL ON FUNCTION linkedin_claim_generation(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION linkedin_claim_generation(integer) TO service_role;
