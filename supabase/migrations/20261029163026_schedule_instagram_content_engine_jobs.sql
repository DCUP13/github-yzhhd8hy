/*
# Schedule Instagram content engine background jobs

1. Changes
- Adds two background jobs that run every minute:
  - `instagram-content-engine`: writes captions and picks photos for pending planned posts.
  - `process-instagram-engine-queue`: sends due planned posts to the existing Instagram publisher and records results.

2. Notes
1. No tables or data are modified.
2. Existing jobs are replaced if they already exist, so this is safe to re-run.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-content-engine') THEN
    PERFORM cron.unschedule('instagram-content-engine');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-instagram-engine-queue') THEN
    PERFORM cron.unschedule('process-instagram-engine-queue');
  END IF;
END $$;

SELECT cron.schedule('instagram-content-engine', '* * * * *', $$
SELECT net.http_post(
  url := 'https://hsfgartycferbpmevtko.supabase.co/functions/v1/instagram-content-engine',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := '{}'::jsonb,
  timeout_milliseconds := 150000
)
$$);

SELECT cron.schedule('process-instagram-engine-queue', '* * * * *', $$
SELECT net.http_post(
  url := 'https://hsfgartycferbpmevtko.supabase.co/functions/v1/process-instagram-engine-queue',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
)
$$);