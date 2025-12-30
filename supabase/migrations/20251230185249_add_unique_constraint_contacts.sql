/*
  # Add unique constraint to contacts table
  
  ## Changes
    - Add unique constraint on (user_id, campaign_id, screen_name) to prevent duplicates
    - Add unique constraint on (contact_id, zpid) for listings table
*/

-- Add unique constraint to contacts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'contacts_user_campaign_screen_unique'
  ) THEN
    ALTER TABLE contacts 
    ADD CONSTRAINT contacts_user_campaign_screen_unique 
    UNIQUE (user_id, campaign_id, screen_name);
  END IF;
END $$;

-- Add unique constraint to listings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'listings_contact_zpid_unique'
  ) THEN
    ALTER TABLE listings 
    ADD CONSTRAINT listings_contact_zpid_unique 
    UNIQUE (contact_id, zpid);
  END IF;
END $$;