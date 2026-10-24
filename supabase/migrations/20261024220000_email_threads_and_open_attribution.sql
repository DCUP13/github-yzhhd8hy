/*
# Email conversation threads + correct read-receipt attribution

1. Plain-English summary
- Every sent and received email now carries a `thread_id` so a whole back-and-forth conversation can be shown together.
- Incoming replies are automatically linked to the sent email they answer (by sender/recipient and subject).
- Replies started from the Sent tab are linked to the sent email they continue.
- Gmail (and others) reload the tracking image of every earlier message when a conversation is opened,
  which made opens land on old emails. Opens are now credited to the newest email in the same conversation
  sent to that recipient before the open happened.

2. New columns
- `email_sent.thread_id` (uuid) - conversation this sent email belongs to.
- `emails.thread_id` (uuid) - conversation this received email belongs to.
- `email_outbox.reply_to_sent_id` (uuid, FK email_sent, ON DELETE SET NULL) - set when replying from the Sent tab.

3. New functions / triggers (SECURITY DEFINER, fixed search_path, not callable by app roles)
- `email_norm_subject(text)`, `email_addr(text)` helpers.
- `assign_sent_thread()` BEFORE INSERT on `email_sent`.
- `assign_inbound_thread()` BEFORE INSERT on `emails`.
- `link_email_event()` updated to re-target opens to the newest message in the thread.

4. Data backfill
- Existing rows are assigned threads in time order; existing opens are re-targeted and
  open counts recomputed for sent emails that have tracking events.

5. Security
- No policy changes. New outbox column is covered by the existing owner-scoped policies.
*/

ALTER TABLE email_sent ADD COLUMN IF NOT EXISTS thread_id uuid;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS thread_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='email_outbox' AND column_name='reply_to_sent_id') THEN
    ALTER TABLE email_outbox ADD COLUMN reply_to_sent_id uuid REFERENCES email_sent(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_sent_thread_id_idx ON email_sent (thread_id);
CREATE INDEX IF NOT EXISTS emails_thread_id_idx ON emails (thread_id);

CREATE OR REPLACE FUNCTION public.email_norm_subject(s text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(btrim(regexp_replace(coalesce(s, ''), '^\s*((re|fwd?|aw)\s*:\s*)+', '', 'i')))
$$;

CREATE OR REPLACE FUNCTION public.email_addr(s text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(substring(coalesce(s, '') from '[^<>\s,;"]+@[^<>\s,;"]+'))
$$;

CREATE OR REPLACE FUNCTION public.assign_sent_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent_sent uuid;
BEGIN
  IF NEW.thread_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reply_to_id IS NOT NULL THEN
    SELECT coalesce(e.thread_id, e.id) INTO NEW.thread_id FROM emails e WHERE e.id = NEW.reply_to_id;
  END IF;

  IF NEW.thread_id IS NULL THEN
    SELECT o.reply_to_sent_id INTO v_parent_sent
    FROM email_outbox o
    WHERE o.reply_to_sent_id IS NOT NULL
      AND o.user_id IS NOT DISTINCT FROM NEW.user_id
      AND o.to_email IS NOT DISTINCT FROM NEW.to_email
      AND o.subject IS NOT DISTINCT FROM NEW.subject
      AND o.created_at > now() - interval '1 day'
    ORDER BY o.created_at DESC
    LIMIT 1;
    IF v_parent_sent IS NOT NULL THEN
      SELECT coalesce(s.thread_id, s.id) INTO NEW.thread_id FROM email_sent s WHERE s.id = v_parent_sent;
    END IF;
  END IF;

  NEW.thread_id := coalesce(NEW.thread_id, NEW.id);
  RETURN NEW;
END;
$$;

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

  NEW.thread_id := coalesce(NEW.thread_id, NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_sent_thread_trigger ON email_sent;
CREATE TRIGGER assign_sent_thread_trigger BEFORE INSERT ON email_sent
  FOR EACH ROW EXECUTE FUNCTION public.assign_sent_thread();

DROP TRIGGER IF EXISTS assign_inbound_thread_trigger ON emails;
CREATE TRIGGER assign_inbound_thread_trigger BEFORE INSERT ON emails
  FOR EACH ROW EXECUTE FUNCTION public.assign_inbound_thread();

CREATE OR REPLACE FUNCTION public.link_email_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_header text;
  v_latest uuid;
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

  IF NEW.email_sent_id IS NOT NULL AND lower(coalesce(NEW.event_type, '')) LIKE '%open%' THEN
    SELECT n.id INTO v_latest
    FROM email_sent o
    JOIN email_sent n ON n.thread_id = o.thread_id
      AND n.to_email IS NOT DISTINCT FROM o.to_email
      AND n.sent_at <= coalesce(NEW.event_time, now())
    WHERE o.id = NEW.email_sent_id AND o.thread_id IS NOT NULL
    ORDER BY n.sent_at DESC
    LIMIT 1;
    NEW.email_sent_id := coalesce(v_latest, NEW.email_sent_id);
  END IF;

  PERFORM public.apply_email_event_status(NEW.email_sent_id, NEW.event_type, NEW.event_time);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_sent_thread() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_inbound_thread() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_email_event() FROM PUBLIC, anon, authenticated;

-- Backfill threads in chronological order
DO $$
DECLARE
  r record;
  v_sender text;
  v_subject text;
  v_parent uuid;
  v_thread uuid;
  v_to text;
  v_from text;
  v_reply_to uuid;
  v_t timestamptz;
BEGIN
  FOR r IN
    SELECT 'sent' k, id, sent_at t FROM email_sent WHERE thread_id IS NULL
    UNION ALL
    SELECT 'in', id, created_at FROM emails WHERE thread_id IS NULL
    ORDER BY t
  LOOP
    v_thread := NULL;
    v_parent := NULL;
    IF r.k = 'sent' THEN
      SELECT reply_to_id, to_email, public.email_norm_subject(subject), sent_at, subject
        INTO v_reply_to, v_to, v_subject, v_t, v_from FROM email_sent WHERE id = r.id;
      IF v_reply_to IS NOT NULL THEN
        SELECT coalesce(e.thread_id, e.id) INTO v_thread FROM emails e WHERE e.id = v_reply_to;
      END IF;
      IF v_thread IS NULL AND v_from ~* '^\s*re\s*:' THEN
        SELECT x.thread_id INTO v_thread FROM (
          SELECT s2.thread_id, s2.sent_at t FROM email_sent s2
          WHERE s2.id <> r.id AND s2.thread_id IS NOT NULL AND s2.sent_at < v_t
            AND s2.to_email IS NOT DISTINCT FROM v_to
            AND public.email_norm_subject(s2.subject) = v_subject
          UNION ALL
          SELECT e.thread_id, e.created_at FROM emails e
          WHERE e.thread_id IS NOT NULL AND e.created_at < v_t
            AND position(public.email_addr(e.sender) in lower(coalesce(v_to, ''))) > 0
            AND public.email_norm_subject(e.subject) = v_subject
        ) x ORDER BY x.t DESC LIMIT 1;
      END IF;
      UPDATE email_sent SET thread_id = coalesce(v_thread, r.id) WHERE id = r.id;
    ELSE
      SELECT public.email_addr(sender), public.email_norm_subject(subject), reply_to_sent_id
        INTO v_sender, v_subject, v_parent FROM emails WHERE id = r.id;
      IF v_parent IS NULL AND v_sender IS NOT NULL AND v_subject <> '' THEN
        SELECT s.id INTO v_parent
        FROM email_sent s, emails e
        WHERE e.id = r.id
          AND position(v_sender in lower(coalesce(s.to_email, ''))) > 0
          AND public.email_norm_subject(s.subject) = v_subject
          AND EXISTS (SELECT 1 FROM unnest(coalesce(e.receiver, ARRAY[]::text[])) x WHERE public.email_addr(x) = public.email_addr(s.from_email))
          AND s.sent_at <= e.created_at
        ORDER BY s.sent_at DESC LIMIT 1;
      END IF;
      IF v_parent IS NOT NULL THEN
        SELECT coalesce(thread_id, id) INTO v_thread FROM email_sent WHERE id = v_parent;
      END IF;
      UPDATE emails SET reply_to_sent_id = v_parent, thread_id = coalesce(v_thread, r.id) WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- Re-target historic opens to the newest message in the thread
UPDATE email_events ev
SET email_sent_id = (
  SELECT n.id FROM email_sent o JOIN email_sent n
    ON n.thread_id = o.thread_id AND n.to_email IS NOT DISTINCT FROM o.to_email AND n.sent_at <= ev.event_time
  WHERE o.id = ev.email_sent_id
  ORDER BY n.sent_at DESC LIMIT 1
)
WHERE ev.email_sent_id IS NOT NULL
  AND lower(ev.event_type) LIKE '%open%'
  AND EXISTS (
    SELECT 1 FROM email_sent o JOIN email_sent n
      ON n.thread_id = o.thread_id AND n.to_email IS NOT DISTINCT FROM o.to_email AND n.sent_at <= ev.event_time
    WHERE o.id = ev.email_sent_id
  );

UPDATE email_sent s
SET open_count = (SELECT count(*) FROM email_events ev WHERE ev.email_sent_id = s.id AND lower(ev.event_type) LIKE '%open%'),
    opened_at = (SELECT min(ev.event_time) FROM email_events ev WHERE ev.email_sent_id = s.id AND lower(ev.event_type) LIKE '%open%')
WHERE EXISTS (SELECT 1 FROM email_events ev WHERE ev.email_sent_id = s.id);
