/*
  # Add campaign scrape progress tracking

  1. Changes
    - Add `scrape_screen_names` jsonb to campaigns — list of agent screen names pending processing
    - Add `scrape_list_page` integer — last page fetched from the findAgent list endpoint
    - Add `scrape_list_complete` boolean — true when all list pages have been fetched
    - Add `scrape_index` integer — next index in `scrape_screen_names` to process
    - Add `scrape_error` text — last scrape error for debugging

  2. Purpose
    - Allow campaign scraping to resume where it left off after being turned off and on again
    - Each invocation of scrape-agents performs a single step and self-invokes, so the campaign can be paused at any moment
*/

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS scrape_screen_names jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scrape_list_page integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scrape_list_complete boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS scrape_index integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scrape_error text DEFAULT '';
