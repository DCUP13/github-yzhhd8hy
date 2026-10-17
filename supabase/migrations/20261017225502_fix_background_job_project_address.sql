/*
# Point background jobs at the current project address

1. Problem
- Four scheduled jobs that run every minute were calling an old project address
  (or a database setting that was never configured), so every call failed with
  "Couldn't resolve host name".
- Affected: LinkedIn post writer, LinkedIn publishing queue, Instagram publishing
  queue, Instagram auto-reply queue.

2. Change
- Re-schedules each job (same name, same every-minute schedule) so it calls the
  edge function on the current project. All four functions are public
  (verify_jwt = false), so no auth header is needed.

3. Notes
- No tables or data are modified.
*/

SELECT cron.schedule('linkedin-content-engine', '* * * * *', $$
SELECT net.http_post(
  url := 'https://hsfgartycferbpmevtko.supabase.co/functions/v1/linkedin-content-engine',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := '{}'::jsonb,
  timeout_milliseconds := 150000
)
$$);

SELECT cron.schedule('process-linkedin-queue', '* * * * *', $$
SELECT net.http_post(
  url := 'https://hsfgartycferbpmevtko.supabase.co/functions/v1/process-linkedin-queue',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
)
$$);

SELECT cron.schedule('process-instagram-queue', '* * * * *', $$
SELECT net.http_post(
  url := 'https://hsfgartycferbpmevtko.supabase.co/functions/v1/process-instagram-queue',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
)
$$);

SELECT cron.schedule('process-instagram-response-queue', '* * * * *', $$
SELECT net.http_post(
  url := 'https://hsfgartycferbpmevtko.supabase.co/functions/v1/process-response-queue',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
)
$$);
