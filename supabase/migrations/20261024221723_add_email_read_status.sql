/*
# Add read/unread status to inbox emails

Lets the inbox show new emails as unread and mark them read when opened.

1. Modified Tables
- `emails`
  - `read_at` (timestamptz, nullable) - when the email was first opened in the app. NULL means unread.
2. Data
- Existing emails are marked as read (read_at = created_at) so only newly arriving mail shows as unread.
3. Security
- New UPDATE policy for authenticated users, matching the table's existing shared-inbox read/delete policies.
- Table-wide UPDATE privilege is revoked from anon and authenticated; authenticated may update ONLY the `read_at` column,
  so the app cannot alter sender, subject, body or thread links.
4. Notes
- Index on unread rows for fast unread counts.
*/

ALTER TABLE emails ADD COLUMN IF NOT EXISTS read_at timestamptz;

UPDATE emails SET read_at = coalesce(created_at, now()) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS emails_unread_idx ON emails (created_at DESC) WHERE read_at IS NULL;

REVOKE UPDATE ON emails FROM anon, authenticated;
GRANT UPDATE (read_at) ON emails TO authenticated;

DROP POLICY IF EXISTS "Allow authenticated mark read" ON emails;
CREATE POLICY "Allow authenticated mark read" ON emails FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
