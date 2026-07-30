/*
# Create contact_messages table for public contact form

1. New Tables
- `contact_messages`
  - `id` (uuid, primary key)
  - `name` (text, name of the person submitting the form)
  - `email` (text, email of the person submitting the form)
  - `message` (text, the message body)
  - `created_at` (timestamptz, default now())
  - `status` (text, default 'new' — used to track read/unread state later)

2. Security
- Enable RLS on `contact_messages`.
- Allow anon + authenticated to INSERT (public contact form submits without sign-in).
- No SELECT/UPDATE/DELETE for anon or authenticated — only service role (dashboard) reads these.
*/

CREATE TABLE IF NOT EXISTS contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_contact_messages" ON contact_messages;
CREATE POLICY "anon_insert_contact_messages"
ON contact_messages FOR INSERT
TO anon, authenticated WITH CHECK (true);