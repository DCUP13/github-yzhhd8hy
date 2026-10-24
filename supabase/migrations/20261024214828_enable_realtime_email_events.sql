/*
# Enable realtime for email events and inbox

1. Changes
- Adds `email_events` and `emails` to the `supabase_realtime` publication so the Emails page
  can show sent/delivered/opened/clicked/bounced events and new inbound mail as they happen.
  (`email_sent` and `email_outbox` are already published.)

2. Security
- Realtime respects existing RLS SELECT policies; users only receive events for their own sent emails.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'email_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_events;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'emails') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.emails;
  END IF;
END $$;
