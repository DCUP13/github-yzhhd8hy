/*
# Schedule Instagram auto-refresh

1. Jobs
- `instagram-auto-refresh` (every 5 minutes): finds users with auto-refresh turned on whose chosen interval
  (1/6/12/24 hours) has passed since their last sync, and re-syncs their connected Instagram accounts.
  Previously the setting was saved but nothing ever acted on it.

2. Notes
- The function uses its own server-side credentials, so no key is sent.
- Re-running replaces the job instead of duplicating it.
- No tables, columns or security policies change.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-auto-refresh') THEN
    PERFORM cron.unschedule('instagram-auto-refresh');
  END IF;
END $$;

SELECT cron.schedule(
  'instagram-auto-refresh',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://hsfgartycferbpmevtko.supabase.co/functions/v1/instagram-auto-refresh',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )$$
);