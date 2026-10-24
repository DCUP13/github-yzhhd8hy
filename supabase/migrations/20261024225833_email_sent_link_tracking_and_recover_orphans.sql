/*
# Link detection on sent emails + recover two untracked sends

1. Modified Tables
- `email_sent`
  - `has_links` (boolean, computed automatically): true when the email body contains a link
    (an `href=`, an `http(s)://` address, or a `www.` address). Only these emails can be clicked,
    so they form the base of the click rate.
  - `is_tracked` (boolean, computed automatically): true when the email was sent with a delivery
    tracking id, meaning delivery/open/click events can be reported for it. Older emails sent
    before tracking existed are false and are excluded from delivery-based rates.

2. Data recovery
- Two replies ("Re: testasdfsad" on 2026-10-24) were sent and tracked by the email provider
  but never recorded in Sent. They are added now using the provider's tracking details, and
  their existing delivered/opened events are attached automatically by the existing trigger.
- The first inbound reply in that thread is linked back to the recovered send.

3. Security
- No policy or grant changes; the new columns are covered by existing `email_sent` policies.

4. Notes
- Both columns are generated, so they stay correct for every future insert or edit with no app changes.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_sent' AND column_name='has_links') THEN
    ALTER TABLE email_sent ADD COLUMN has_links boolean
      GENERATED ALWAYS AS (coalesce(body, '') ~* '(href\s*=|https?://|www\.[a-z0-9-]+\.[a-z])') STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_sent' AND column_name='is_tracked') THEN
    ALTER TABLE email_sent ADD COLUMN is_tracked boolean
      GENERATED ALWAYS AS (ses_message_id IS NOT NULL OR message_id IS NOT NULL) STORED;
  END IF;
END $$;

DO $$
DECLARE
  v_user uuid;
  v_first uuid;
BEGIN
  SELECT user_id INTO v_user FROM email_sent WHERE from_email = 'support@loiblast.com' ORDER BY sent_at DESC LIMIT 1;
  IF v_user IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM email_sent WHERE ses_message_id = '010001a16f6024fa-b04dd916-bc77-46b2-9560-198f6bcdf10e-000000') THEN
    INSERT INTO email_sent (user_id, to_email, from_email, subject, body, sent_at, created_at, ses_message_id, thread_id)
    VALUES (v_user, 'devoncadvertising@gmail.com', 'support@loiblast.com', 'Re: testasdfsad',
            'hello this is another test', '2026-10-24T19:25:34.330Z', '2026-10-24T19:25:34.330Z',
            '010001a16f6024fa-b04dd916-bc77-46b2-9560-198f6bcdf10e-000000',
            (SELECT thread_id FROM emails WHERE id = 'e625148a-32dc-408d-98aa-bb2845ae6f36'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM email_sent WHERE ses_message_id = '010001a16f61f689-ce78d2cb-74f4-4f5a-a9bc-b903198cc947-000000') THEN
    INSERT INTO email_sent (user_id, to_email, from_email, subject, body, sent_at, created_at, ses_message_id, thread_id, reply_to_id)
    VALUES (v_user, 'devoncadvertising@gmail.com', 'support@loiblast.com', 'Re: testasdfsad',
            '(Message content was not recorded)', '2026-10-24T19:27:33.513Z', '2026-10-24T19:27:33.513Z',
            '010001a16f61f689-ce78d2cb-74f4-4f5a-a9bc-b903198cc947-000000',
            (SELECT thread_id FROM emails WHERE id = 'e625148a-32dc-408d-98aa-bb2845ae6f36'),
            (SELECT id FROM emails WHERE id = 'e625148a-32dc-408d-98aa-bb2845ae6f36'));
  END IF;

  SELECT id INTO v_first FROM email_sent WHERE ses_message_id = '010001a16f6024fa-b04dd916-bc77-46b2-9560-198f6bcdf10e-000000';
  UPDATE emails SET reply_to_sent_id = v_first
  WHERE id = 'e625148a-32dc-408d-98aa-bb2845ae6f36' AND reply_to_sent_id IS NULL;
END $$;