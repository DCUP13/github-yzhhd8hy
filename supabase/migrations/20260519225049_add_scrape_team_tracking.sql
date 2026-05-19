/*
  # Add scrape team member tracking

  1. Changes
    - Add `scrape_team_members` jsonb — list of team member screen names for current agent
    - Add `scrape_team_index` integer — next team member index to process

  2. Purpose
    - Enables pausing and resuming mid-team-member processing
    - Each invocation processes exactly one API call (agent or team member)
*/

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS scrape_team_members jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scrape_team_index integer DEFAULT 0;
