/*
# Schedule LinkedIn background jobs

1. Jobs (run every minute)
- `process-linkedin-queue`: publishes LinkedIn posts whose scheduled time has arrived (previously nothing triggered it,
  so scheduled posts never went out on their own).
- `linkedin-content-engine`: writes pending AI posts (and research posts once inside the research lead window),
  a few at a time.

2. Notes
- Both functions are public background processors that use their own server-side credentials, so no key is sent.
- Re-running this migration replaces the jobs rather than duplicating them.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-linkedin-queue') THEN
    PERFORM cron.unschedule('process-linkedin-queue');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'linkedin-content-engine') THEN
    PERFORM cron.unschedule('linkedin-content-engine');
  END IF;
END $$;

SELECT cron.schedule(
  'process-linkedin-queue',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://dpbhkzqaiqaxdbxjohxy.supabase.co/functions/v1/process-linkedin-queue',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  )$$
);

SELECT cron.schedule(
  'linkedin-content-engine',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://dpbhkzqaiqaxdbxjohxy.supabase.co/functions/v1/linkedin-content-engine',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )$$
);
