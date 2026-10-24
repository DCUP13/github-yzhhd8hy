/*
# Group inbound replies into one conversation even without a matching sent email

1. Changes
- `assign_inbound_thread()`: when no sent email matches, the new email joins the most recent
  conversation that has an inbound email from the same sender with the same subject (ignoring Re:/Fwd:).
- Backfills existing inbound emails that ended up as their own one-message conversation.

2. Security
- No policy changes; function remains SECURITY DEFINER with fixed search_path and no app-role EXECUTE.
*/

CREATE OR REPLACE FUNCTION public.assign_inbound_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender text := public.email_addr(NEW.sender);
  v_subject text := public.email_norm_subject(NEW.subject);
BEGIN
  IF NEW.thread_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reply_to_sent_id IS NULL AND v_sender IS NOT NULL AND v_subject <> '' THEN
    SELECT s.id INTO NEW.reply_to_sent_id
    FROM email_sent s
    WHERE position(v_sender in lower(coalesce(s.to_email, ''))) > 0
      AND public.email_norm_subject(s.subject) = v_subject
      AND EXISTS (
        SELECT 1 FROM unnest(coalesce(NEW.receiver, ARRAY[]::text[])) r
        WHERE public.email_addr(r) = public.email_addr(s.from_email)
      )
      AND s.sent_at <= coalesce(NEW.created_at, now())
    ORDER BY s.sent_at DESC
    LIMIT 1;
  END IF;

  IF NEW.reply_to_sent_id IS NOT NULL THEN
    SELECT coalesce(s.thread_id, s.id) INTO NEW.thread_id FROM email_sent s WHERE s.id = NEW.reply_to_sent_id;
  END IF;

  IF NEW.thread_id IS NULL AND v_sender IS NOT NULL AND v_subject <> '' THEN
    SELECT e.thread_id INTO NEW.thread_id
    FROM emails e
    WHERE e.thread_id IS NOT NULL
      AND public.email_addr(e.sender) = v_sender
      AND public.email_norm_subject(e.subject) = v_subject
      AND e.created_at <= coalesce(NEW.created_at, now())
    ORDER BY e.created_at DESC
    LIMIT 1;
  END IF;

  NEW.thread_id := coalesce(NEW.thread_id, NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_inbound_thread() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
  v_thread uuid;
BEGIN
  FOR r IN
    SELECT id, sender, subject, created_at FROM emails
    WHERE thread_id = id AND reply_to_sent_id IS NULL
    ORDER BY created_at
  LOOP
    SELECT e.thread_id INTO v_thread
    FROM emails e
    WHERE e.id <> r.id
      AND e.created_at < r.created_at
      AND public.email_addr(e.sender) = public.email_addr(r.sender)
      AND public.email_norm_subject(e.subject) = public.email_norm_subject(r.subject)
      AND public.email_norm_subject(r.subject) <> ''
    ORDER BY e.created_at DESC
    LIMIT 1;
    IF v_thread IS NOT NULL THEN
      UPDATE emails SET thread_id = v_thread WHERE id = r.id;
      UPDATE email_sent SET thread_id = v_thread WHERE thread_id = r.id;
    END IF;
    v_thread := NULL;
  END LOOP;
END $$;
