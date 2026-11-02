/*
# Saved links for Instagram posts

Users keep a library of web links and choose one per post. A plan slot can set a default link
that new posts from that slot start with; each scheduled post then carries its own link, which
can be changed in the post editor. The link address is read from the library at publish time,
so editing a saved link updates every post using it that has not been published yet.

1. New Tables
- `instagram_links` - saved links: `name` (label shown in pickers), `url` (full https address), owner `user_id`.

2. Modified Tables
- `instagram_plan_slots.link_id` - default saved link for posts created from this slot (nullable).
- `instagram_scheduled_posts.link_id` - the link added to this post's caption when it goes out (nullable).
- Both reference `instagram_links` with ON DELETE SET NULL, so deleting a link just removes it from posts.

3. Data
- Every existing non-empty slot `link_url` is copied into the library (one row per distinct user + address),
  and slots plus their unpublished posts are pointed at it. `link_url` is kept but no longer used.

4. Functions
- `instagram_generate_weeks` now copies the slot's default link onto each new post.

5. Security
- RLS enabled on `instagram_links`; owner-only select/insert/update/delete for authenticated users.
- Grants to authenticated (CRUD) and service_role (the publisher reads link addresses).
- Added to realtime so open screens refresh when links change.
*/

CREATE TABLE IF NOT EXISTS instagram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  url text NOT NULL CHECK (url ~* '^https?://'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instagram_links_user_idx ON instagram_links (user_id);

ALTER TABLE instagram_links ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON instagram_links TO authenticated, service_role;

DROP POLICY IF EXISTS "select_own_instagram_links" ON instagram_links;
CREATE POLICY "select_own_instagram_links" ON instagram_links FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_instagram_links" ON instagram_links;
CREATE POLICY "insert_own_instagram_links" ON instagram_links FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_instagram_links" ON instagram_links;
CREATE POLICY "update_own_instagram_links" ON instagram_links FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_instagram_links" ON instagram_links;
CREATE POLICY "delete_own_instagram_links" ON instagram_links FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_plan_slots' AND column_name = 'link_id') THEN
    ALTER TABLE instagram_plan_slots ADD COLUMN link_id uuid REFERENCES instagram_links(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_scheduled_posts' AND column_name = 'link_id') THEN
    ALTER TABLE instagram_scheduled_posts ADD COLUMN link_id uuid REFERENCES instagram_links(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS instagram_scheduled_posts_link_idx ON instagram_scheduled_posts (link_id);

INSERT INTO instagram_links (user_id, name, url)
SELECT DISTINCT s.user_id, trim(s.link_url), trim(s.link_url)
FROM instagram_plan_slots s
WHERE trim(s.link_url) ~* '^https?://'
  AND NOT EXISTS (SELECT 1 FROM instagram_links l WHERE l.user_id = s.user_id AND l.url = trim(s.link_url));

UPDATE instagram_plan_slots s
SET link_id = l.id
FROM instagram_links l
WHERE s.link_id IS NULL AND l.user_id = s.user_id AND l.url = trim(s.link_url);

UPDATE instagram_scheduled_posts p
SET link_id = s.link_id
FROM instagram_plan_slots s
WHERE p.slot_id = s.id AND p.link_id IS NULL AND s.link_id IS NOT NULL
  AND p.status NOT IN ('publishing', 'published', 'partial');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'instagram_links') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE instagram_links;
  END IF;
END $$;

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
          account_ids, link_id, status, generation_status
        ) VALUES (
          uid, v_plan_id, s.id, job, s.prompt_id, s.topic_id, s.topic_label, s.voice_sample_id,
          wk, d, ts, s.media_type, CASE WHEN s.media_type = 'carousel' THEN s.carousel_size ELSE 1 END,
          s.overlay_mode, CASE WHEN s.overlay_mode = 'fixed' THEN s.overlay_text ELSE '' END,
          coalesce(v_accounts, '{}'), s.link_id, 'scheduled', 'pending'
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
