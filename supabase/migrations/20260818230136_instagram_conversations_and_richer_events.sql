/*
# Instagram Conversations & Richer Event Data

1. Purpose
   Upgrades the instagram_webhook_events table to support:
   - Conversation grouping (DMs grouped by sender, comments grouped by media)
   - Message direction (incoming vs outgoing/echo)
   - Recipient tracking for DMs
   - Sender profile info (name, username, profile pic) resolved via Graph API
   - Reply tracking (reply_text, replied_at)
   - Media metadata for comments on reels/posts (media_type, media_permalink, media_caption)

2. Changes to instagram_webhook_events
   Added columns:
   - recipient_id (text) — the other party in a DM (from raw_event.recipient.id)
   - direction (text, default 'incoming') — 'incoming' or 'outgoing' (echo messages from the account owner)
   - sender_name (text) — resolved sender display name
   - sender_profile_url (text) — sender profile picture URL
   - media_type (text) — 'REEL', 'IMAGE', 'VIDEO', 'CAROUSEL_ALBUM', etc.
   - media_permalink (text) — link to the post/reel
   - media_caption (text) — caption of the post/reel
   - reply_text (text) — text of reply sent from the app
   - replied_at (timestamptz) — when the reply was sent

3. Changes to instagram_accounts
   Added columns:
   - page_scoped_id (text) — the ID Meta uses in webhook entry.id, which differs from the IG business account ID stored in ig_user_id

4. Indexes
   - idx_ig_events_conversation on (user_id, sender_id, created_at) for conversation grouping
   - idx_ig_events_recipient on (user_id, recipient_id, created_at) for DM thread lookups

5. Security
   - No new tables, existing RLS policies remain in effect.
   - UPDATE policy already exists for authenticated owners.
*/

-- Add conversation and enrichment columns to webhook events
ALTER TABLE instagram_webhook_events
  ADD COLUMN IF NOT EXISTS recipient_id text,
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'incoming',
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS sender_profile_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_permalink text,
  ADD COLUMN IF NOT EXISTS media_caption text,
  ADD COLUMN IF NOT EXISTS reply_text text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;

-- Add page_scoped_id to instagram_accounts for webhook matching
ALTER TABLE instagram_accounts
  ADD COLUMN IF NOT EXISTS page_scoped_id text;

-- Indexes for conversation grouping
CREATE INDEX IF NOT EXISTS idx_ig_events_conversation
  ON instagram_webhook_events (user_id, sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ig_events_recipient
  ON instagram_webhook_events (user_id, recipient_id, created_at DESC);

-- Backfill direction for existing echo messages
UPDATE instagram_webhook_events
SET direction = 'outgoing'
WHERE raw_event->'message'->>'is_echo' = 'true';
