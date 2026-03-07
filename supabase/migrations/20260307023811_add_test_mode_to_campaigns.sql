/*
  # Add test_mode to campaigns

  1. Changes
    - Add `test_mode` boolean column to campaigns table with default false
    - This column controls whether emails go to drafts (true) or outbox (false) when campaign runs

  2. Notes
    - When test_mode is true, emails are generated as drafts for review
    - When test_mode is false, emails are sent automatically according to sending schedule
    - Existing campaigns will have test_mode set to false by default
*/

-- Add test_mode column to campaigns table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'test_mode'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN test_mode boolean DEFAULT false;
  END IF;
END $$;
