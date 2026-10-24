/*
# Enable realtime for LinkedIn tables

Adds every LinkedIn table to the `supabase_realtime` publication so open sessions on
other devices receive live change notifications and refresh instantly.

1. Modified Tables (added to realtime publication)
- linkedin_accounts, linkedin_analytics_snapshots, linkedin_content_settings,
  linkedin_generation_jobs, linkedin_plan_assignments, linkedin_plan_slots,
  linkedin_posting_schedules, linkedin_posts, linkedin_prompt_plans,
  linkedin_skip_dates, linkedin_topics, linkedin_voice_samples

2. Security
- No policy changes. Realtime honours the existing row level security, so each
  user only receives changes for their own rows.

3. Notes
- Idempotent: tables already in the publication are skipped.
*/

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'linkedin_accounts','linkedin_analytics_snapshots','linkedin_content_settings',
    'linkedin_generation_jobs','linkedin_plan_assignments','linkedin_plan_slots',
    'linkedin_posting_schedules','linkedin_posts','linkedin_prompt_plans',
    'linkedin_skip_dates','linkedin_topics','linkedin_voice_samples'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;