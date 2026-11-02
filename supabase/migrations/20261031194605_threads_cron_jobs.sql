/*
# Threads background schedules

1. Changes
- Schedules `threads-content-engine` (every minute) to write AI posts that are waiting.
- Schedules `process-threads-queue` (every minute) to publish posts that are due.
- Schedules `threads-maintenance` (hourly) to refresh Threads logins and update post stats.
- Updates `threads_claim_publish`: a post stuck in "publishing" for 20+ minutes is now marked failed
  (with an explanation) instead of being retried, so a post is never published twice.

2. Security
- Claim function stays SECURITY DEFINER and executable only by service_role.

3. Notes
1. Each job is removed first if it already exists, so this is safe to re-run.
*/

CREATE OR REPLACE FUNCTION threads_claim_publish(p_limit integer)
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE threads_posts SET status = 'failed',
    publish_error = 'Publishing did not finish. Check Threads before trying again so it is not posted twice.',
    updated_at = now()
  WHERE status = 'publishing' AND updated_at < now() - interval '20 minutes';

  RETURN QUERY
  WITH due AS (
    SELECT p.id FROM threads_posts p
    WHERE p.status = 'scheduled' AND p.generation_status IN ('done', 'none')
      AND p.scheduled_for <= now()
    ORDER BY p.scheduled_for ASC
    LIMIT p_limit
    FOR UPDATE OF p SKIP LOCKED
  )
  UPDATE threads_posts tp SET status = 'publishing', publish_error = NULL, updated_at = now()
  FROM due WHERE tp.id = due.id
  RETURNING tp.id;
END $$;
REVOKE EXECUTE ON FUNCTION threads_claim_publish(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION threads_claim_publish(integer) TO service_role;

DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['threads-content-engine','process-threads-queue','threads-maintenance'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN PERFORM cron.unschedule(j); END IF;
  END LOOP;
END $$;

SELECT cron.schedule('threads-content-engine', '* * * * *',
  $$SELECT net.http_post(url:='https://hsfgartycferbpmevtko.supabase.co/functions/v1/threads-content-engine', headers:=jsonb_build_object('Content-Type','application/json'), body:='{}'::jsonb, timeout_milliseconds:=150000)$$);
SELECT cron.schedule('process-threads-queue', '* * * * *',
  $$SELECT net.http_post(url:='https://hsfgartycferbpmevtko.supabase.co/functions/v1/process-threads-queue', headers:=jsonb_build_object('Content-Type','application/json'), body:='{}'::jsonb, timeout_milliseconds:=150000)$$);
SELECT cron.schedule('threads-maintenance', '17 * * * *',
  $$SELECT net.http_post(url:='https://hsfgartycferbpmevtko.supabase.co/functions/v1/threads-maintenance', headers:=jsonb_build_object('Content-Type','application/json'), body:='{}'::jsonb, timeout_milliseconds:=150000)$$);
