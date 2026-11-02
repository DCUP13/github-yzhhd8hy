/*
# Add photo text size to Instagram plan slots and posts

1. Modified Tables
  - `instagram_plan_slots`: new `overlay_font_size` (integer, default 64, 32-110). The text size used for photo text on posts created from this slot.
  - `instagram_scheduled_posts`: new `overlay_font_size` (integer, default 64, 32-110). Editable per post; used when the text is drawn on the photo.
2. Functions
  - `instagram_generate_weeks` now copies `overlay_font_size` from the slot into each new post.
3. Security
  - No policy changes. Existing table grants and owner-scoped RLS cover the new columns.
4. Notes
  1. 64 matches the size used before this change, so existing posts look the same.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='instagram_plan_slots' AND column_name='overlay_font_size') THEN
    ALTER TABLE instagram_plan_slots ADD COLUMN overlay_font_size integer NOT NULL DEFAULT 64 CHECK (overlay_font_size BETWEEN 32 AND 110);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='instagram_scheduled_posts' AND column_name='overlay_font_size') THEN
    ALTER TABLE instagram_scheduled_posts ADD COLUMN overlay_font_size integer NOT NULL DEFAULT 64 CHECK (overlay_font_size BETWEEN 32 AND 110);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.instagram_generate_weeks(p_start date, p_end date, p_replace boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
overlay_prompt_id, overlay_scope, overlay_font_size, account_ids, link_id, status, generation_status
) VALUES (
uid, v_plan_id, s.id, job, s.prompt_id, s.topic_id, s.topic_label, s.voice_sample_id,
wk, d, ts, s.media_type, CASE WHEN s.media_type = 'carousel' THEN s.carousel_size ELSE 1 END,
s.overlay_mode, CASE WHEN s.overlay_mode = 'fixed' THEN s.overlay_text ELSE '' END,
s.overlay_prompt_id, CASE WHEN s.media_type = 'carousel' THEN s.overlay_scope ELSE 'first' END,
s.overlay_font_size, coalesce(v_accounts, '{}'), s.link_id, 'scheduled', 'pending'
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
$function$;
