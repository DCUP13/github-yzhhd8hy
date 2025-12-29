/*
  # Remove duplicate contacts and add unique constraint

  1. Changes
    - Remove duplicate contacts (keep only the first one based on created_at)
    - Add unique constraint on (user_id, campaign_id, screen_name)
    - This prevents duplicate agents from being inserted for the same campaign
  
  2. Notes
    - Deletes duplicates where the same agent appears multiple times in the same campaign
    - Keeps the oldest record for each unique agent
    - Future inserts will automatically prevent duplicates
*/

-- Delete duplicate contacts, keeping only the oldest one
DELETE FROM contacts
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, campaign_id, screen_name 
             ORDER BY created_at ASC
           ) AS row_num
    FROM contacts
  ) t
  WHERE row_num > 1
);

-- Add unique constraint to prevent future duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'contacts_user_campaign_screen_name_unique'
  ) THEN
    ALTER TABLE contacts 
    ADD CONSTRAINT contacts_user_campaign_screen_name_unique 
    UNIQUE (user_id, campaign_id, screen_name);
  END IF;
END $$;