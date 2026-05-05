/*
  # Ensure scrape_locked_until column exists and reload PostgREST cache

  The edge function reported "column campaigns.scrape_locked_until does not exist"
  even though prior migration added it. This migration is idempotent and triggers
  a schema cache reload so PostgREST picks up the column.
*/

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS scrape_locked_until timestamptz DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
