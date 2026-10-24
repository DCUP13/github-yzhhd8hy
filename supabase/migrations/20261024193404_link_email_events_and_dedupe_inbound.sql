/*
# Link email events to sent emails, fix Sent saving, stop duplicate inbound emails

1. Modified Tables
- `email_sent`: add `in_reply_to` (text), `email_references` (text), `step_id` (uuid). The
  send-email function writes these; without them every insert failed and sent emails vanished.
- `emails`: add `message_id` (text, nullable) so replies can be threaded when the receiver provides it.

2. New Functions / Triggers
- `link_email_event()` BEFORE INSERT on `email_events`: fills `email_sent_id` by matching the SES
  message id (`ses_message_id`) or the app Message-ID header (`message_id`) found in the raw event.
- `link_events_to_sent()` AFTER INSERT on `email_sent`: links events that arrived before the sent row
  was saved (SES often fires "Send" before the function finishes).
- `skip_duplicate_inbound_email()` BEFORE INSERT on `emails`: drops an insert if an identical email
  (same sender, receivers, subject, body) was stored in the last 15 minutes. This absorbs retries
  from the inbound receiver.

3. Data
- Backfills `email_sent_id` on existing events where a matching sent email exists.

4. Security
- Trigger functions are SECURITY DEFINER with a fixed search_path; EXECUTE revoked from PUBLIC/anon/authenticated.
  No policies changed.
*/

ALTER TABLE email_sent ADD COLUMN IF NOT EXISTS in_reply_to text;
ALTER TABLE email_sent ADD COLUMN IF NOT EXISTS email_references text;
ALTER TABLE email_sent ADD COLUMN IF NOT EXISTS step_id uuid;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS message_id text;

CREATE INDEX IF NOT EXISTS email_events_message_id_idx ON email_events (message_id);
CREATE INDEX IF NOT EXISTS emails_sender_created_idx ON emails (sender, created_at);

CREATE OR REPLACE FUNCTION public.email_event_header_message_id(raw jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT h->>'value'
  FROM jsonb_array_elements(
    COALESCE(raw->'detail'->'mail'->'headers', raw->'mail'->'headers', '[]'::jsonb)
  ) h
  WHERE lower(h->>'name') = 'message-id'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.link_email_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_header text;
BEGIN
  IF NEW.email_sent_id IS NULL THEN
    v_header := public.email_event_header_message_id(NEW.raw_event);
    SELECT s.id INTO NEW.email_sent_id
    FROM email_sent s
    WHERE (NEW.message_id IS NOT NULL AND s.ses_message_id = NEW.message_id)
       OR (v_header IS NOT NULL AND s.message_id = v_header)
    ORDER BY s.sent_at DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_events_to_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE email_events e
  SET email_sent_id = NEW.id
  WHERE e.email_sent_id IS NULL
    AND (
      (NEW.ses_message_id IS NOT NULL AND e.message_id = NEW.ses_message_id)
      OR (NEW.message_id IS NOT NULL AND public.email_event_header_message_id(e.raw_event) = NEW.message_id)
    );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.skip_duplicate_inbound_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM emails e
    WHERE e.sender IS NOT DISTINCT FROM NEW.sender
      AND e.subject IS NOT DISTINCT FROM NEW.subject
      AND e.receiver IS NOT DISTINCT FROM NEW.receiver
      AND e.body IS NOT DISTINCT FROM NEW.body
      AND e.created_at > now() - interval '15 minutes'
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_email_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_events_to_sent() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.skip_duplicate_inbound_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS link_email_event_trigger ON email_events;
CREATE TRIGGER link_email_event_trigger
  BEFORE INSERT ON email_events
  FOR EACH ROW EXECUTE FUNCTION public.link_email_event();

DROP TRIGGER IF EXISTS link_events_to_sent_trigger ON email_sent;
CREATE TRIGGER link_events_to_sent_trigger
  AFTER INSERT ON email_sent
  FOR EACH ROW EXECUTE FUNCTION public.link_events_to_sent();

DROP TRIGGER IF EXISTS skip_duplicate_inbound_email_trigger ON emails;
CREATE TRIGGER skip_duplicate_inbound_email_trigger
  BEFORE INSERT ON emails
  FOR EACH ROW EXECUTE FUNCTION public.skip_duplicate_inbound_email();

UPDATE email_events e
SET email_sent_id = s.id
FROM email_sent s
WHERE e.email_sent_id IS NULL
  AND (
    (s.ses_message_id IS NOT NULL AND e.message_id = s.ses_message_id)
    OR (s.message_id IS NOT NULL AND public.email_event_header_message_id(e.raw_event) = s.message_id)
  );
