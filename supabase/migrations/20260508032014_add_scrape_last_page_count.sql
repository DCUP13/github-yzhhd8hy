/*
  # Track per-page scrape progress

  Adds `scrape_last_page_count` so the UI can display how many agents were
  picked up from the most recently fetched list page. The existing columns
  already expose current page, total queued agents, and current index.
*/

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS scrape_last_page_count integer DEFAULT 0;

NOTIFY pgrst, 'reload schema';
