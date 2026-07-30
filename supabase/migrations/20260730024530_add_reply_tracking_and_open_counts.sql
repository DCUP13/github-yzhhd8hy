/*
# Email Reply Tracking & Open Count

1. Purpose
   Adds the ability to link incoming inbox emails back to the sent email they
   reply to (so we can count "how many replies did this sent email get"), and
   adds an open_count column to email_sent so repeated opens are counted
   separately from the first-open timestamp.

2. Changes to existing tables

   a) emails (inbox table)
      - New column: reply_to_sent_id (uuid, nullable)
        References email_sent(id). When an incoming email is a reply to one of
        the user's sent emails, this column links them. This is what powers the
        "X replies" badge on each sent email and the reply thread view.

   b) email_sent
      - New column: open_count (integer, default 0)
        Counts every open event separately. Because delivery itself can trigger
        an open signal and a real human open triggers it again, this count
        captures each occurrence. The existing opened_at timestamp records the
        first open; open_count records the total.

   c) email_sent
      - New column: click_count (integer, default 0)
        Counts every click event separately, mirroring open_count.

3. Security
   - No new tables; both emails and email_sent already have RLS enabled.
   - No policy changes needed — existing policies still apply.
   - The new foreign key on emails.reply_to_sent_id uses ON DELETE SET NULL so
     deleting a sent email doesn't lose the inbox reply itself.

4. Notes
   - All new columns are nullable / defaulted so existing rows are unaffected.
   - The email_events table already records each event individually; open_count
     and click_count are convenience aggregates that the UI reads directly.
*/

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS reply_to_sent_id uuid
  REFERENCES email_sent(id) ON DELETE SET NULL;

ALTER TABLE email_sent
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;

ALTER TABLE email_sent
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_emails_reply_to_sent
  ON emails (reply_to_sent_id);

CREATE INDEX IF NOT EXISTS idx_email_sent_reply_to
  ON email_sent (reply_to_id);
