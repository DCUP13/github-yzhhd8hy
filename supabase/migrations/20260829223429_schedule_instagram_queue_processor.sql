/*
# Schedule Instagram Queue Processor via pg_cron

Schedules the process-instagram-queue edge function to run every minute,
finding scheduled post variations whose time has arrived and publishing them
to Instagram via the Graph API. Modeled on the existing process-response-queue
pg_cron job already in this project.
*/

-- Grant pg_cron access if needed
GRANT USAGE ON SCHEMA cron TO postgres;

-- Drop existing job if re-applied
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-instagram-queue') THEN
    PERFORM cron.unschedule('process-instagram-queue');
  END IF;
END $$;

-- Get the project URL from the current request
-- The edge function URL is constructed from the Supabase project URL
DO $$
DECLARE
  project_url text;
BEGIN
  -- Extract the project URL from the Supabase URL env var
  -- Using a fixed schedule call that hits the edge function endpoint
  project_url := current_setting('app.project_url', true);
  IF project_url IS NULL OR project_url = '' THEN
    -- Fallback: use the anon key and service role to call the function
    -- This uses the SUPABASE_URL pattern
    project_url := '';
  END IF;
END $$;

-- Schedule the edge function to run every minute
-- Using net.http_post to call the edge function (pg_net extension)
-- The function is called with verify_jwt=false so it can run without auth
SELECT cron.schedule(
  'process-instagram-queue',
  '* * * * *',
  $$SELECT
    net.http_post(
      url := 'https://dpbhkzqaiqaxdbxjohxy.supabase.co/functions/v1/process-instagram-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{}'::jsonb
    )
  $$
);