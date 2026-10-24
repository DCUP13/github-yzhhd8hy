/*
# Roll email events up onto sent emails

1. Changes
- New helper `apply_email_event_status(sent_id, event_type, event_time)` updates the tracking fields on
  `email_sent` (delivery_status, delivered_at, opened_at/open_count, clicked_at/click_count,
  bounced_at, complained_at). Event types are matched by keyword, so both the SES EventBridge names
  ("Email Delivered", "Email Opened", ...) and short names ("delivery", "open", ...) work.
- `link_email_event()` now applies the status as soon as an event is linked.
- `link_events_to_sent()` applies the status for events that arrived before the sent row existed.
- Re-applies status for any already-linked events.

2. Security
- Functions are SECURITY DEFINER with a fixed search_path; EXECUTE revoked from PUBLIC/anon/authenticated.
*/

CREATE OR REPLACE FUNCTION public.apply_email_event_status(p_sent_id uuid, p_type text, p_time timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text := lower(coalesce(p_type, ''));
  ts timestamptz := coalesce(p_time, now());
BEGIN
  IF p_sent_id IS NULL THEN
    RETURN;
  END IF;

  IF t LIKE '%deliver%' THEN
    UPDATE email_sent SET delivered_at = coalesce(delivered_at, ts),
      delivery_status = CASE WHEN delivery_status IN ('bounced','complained') THEN delivery_status ELSE 'delivered' END
    WHERE id = p_sent_id;
  ELSIF t LIKE '%open%' THEN
    UPDATE email_sent SET opened_at = coalesce(opened_at, ts), open_count = coalesce(open_count, 0) + 1
    WHERE id = p_sent_id;
  ELSIF t LIKE '%click%' THEN
    UPDATE email_sent SET clicked_at = coalesce(clicked_at, ts), click_count = coalesce(click_count, 0) + 1
    WHERE id = p_sent_id;
  ELSIF t LIKE '%bounce%' THEN
    UPDATE email_sent SET bounced_at = coalesce(bounced_at, ts), delivery_status = 'bounced'
    WHERE id = p_sent_id;
  ELSIF t LIKE '%complain%' THEN
    UPDATE email_sent SET complained_at = coalesce(complained_at, ts), delivery_status = 'complained'
    WHERE id = p_sent_id;
  END IF;
END;
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
  PERFORM public.apply_email_event_status(NEW.email_sent_id, NEW.event_type, NEW.event_time);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_events_to_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    UPDATE email_events e
    SET email_sent_id = NEW.id
    WHERE e.email_sent_id IS NULL
      AND (
        (NEW.ses_message_id IS NOT NULL AND e.message_id = NEW.ses_message_id)
        OR (NEW.message_id IS NOT NULL AND public.email_event_header_message_id(e.raw_event) = NEW.message_id)
      )
    RETURNING e.event_type, e.event_time
  LOOP
    PERFORM public.apply_email_event_status(NEW.id, r.event_type, r.event_time);
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_email_event_status(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_email_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_events_to_sent() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT e.email_sent_id, e.event_type, e.event_time
    FROM email_events e
    JOIN email_sent s ON s.id = e.email_sent_id
    WHERE e.email_sent_id IS NOT NULL
      AND s.delivered_at IS NULL AND s.opened_at IS NULL AND s.clicked_at IS NULL AND s.bounced_at IS NULL
    ORDER BY e.event_time
  LOOP
    PERFORM public.apply_email_event_status(r.email_sent_id, r.event_type, r.event_time);
  END LOOP;
END $$;
