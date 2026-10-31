/*
# Threads follow-up replies (self-reply threads)

Lets a Threads post continue as a chain: the main post is published, then each follow-up is
published as a reply to the previous one, so readers keep scrolling.

1. Modified Tables
- `threads_posts`
  - `reply_texts` (text[], default '{}'): the follow-up texts, in order, posted as replies after the main post.
  - `reply_count` (integer 0-10, default 0): how many follow-ups the AI should write for this post.
- `threads_plan_slots`
  - `reply_count` (integer 0-10, default 0): how many follow-ups the AI writes for posts made from this slot.

2. Modified Functions
- `threads_generate_weeks` now copies the slot's `reply_count` onto each planned post. Logic is otherwise unchanged.

3. Security
- No policy changes. Existing owner-scoped policies cover the new columns. Function grants are re-applied as before.
*/

ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS reply_texts text[] NOT NULL DEFAULT '{}';
ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0;
ALTER TABLE threads_plan_slots ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'threads_posts_reply_count_range') THEN
    ALTER TABLE threads_posts ADD CONSTRAINT threads_posts_reply_count_range CHECK (reply_count BETWEEN 0 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'threads_plan_slots_reply_count_range') THEN
    ALTER TABLE threads_plan_slots ADD CONSTRAINT threads_plan_slots_reply_count_range CHECK (reply_count BETWEEN 0 AND 10);
  END IF;
END $$;

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
          account_ids, also_instagram, instagram_account_ids, reply_count, status, generation_status
        ) VALUES (
          uid, v_plan_id, s.id, job, s.prompt_id, s.topic_id, s.topic_label, s.voice_sample_id,
          wk, d, ts, s.link_id, s.photo_mode, s.photo_count,
          CASE WHEN s.photo_mode = 'upload' THEN s.photo_urls ELSE '{}' END,
          coalesce(v_accounts, '{}'), s.also_instagram, coalesce(v_ig, '{}'), s.reply_count, 'scheduled', 'pending'
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