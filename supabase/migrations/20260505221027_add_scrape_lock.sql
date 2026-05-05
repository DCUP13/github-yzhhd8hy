/*
  # Add scrape concurrency lock

  1. Changes
    - Add `scrape_locked_until` timestamptz to campaigns — set by a running scrape-agents invocation to prevent concurrent runs
    - A concurrent invocation will see the lock is still active and exit immediately
    - The lock is short-lived (30s) so a crashed run self-recovers
*/

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS scrape_locked_until timestamptz DEFAULT NULL;
