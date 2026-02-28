/*
  # Add Team Lead Relationship to Contacts

  ## Changes Made
  
  1. Schema Updates
    - Add `team_lead_id` column to contacts table
      - Links team members to their team lead
      - Nullable (team leads will have NULL)
      - References contacts.id
    - Add foreign key constraint for data integrity
    - Add index for efficient team member lookups
  
  2. Data Integrity
    - Foreign key ensures team_lead_id references valid contacts
    - Cascade delete ensures cleanup when team lead is deleted
  
  3. Performance
    - Index on team_lead_id for fast team member queries
*/

DO $$ 
BEGIN
  -- Add team_lead_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contacts' 
    AND column_name = 'team_lead_id'
  ) THEN
    ALTER TABLE contacts 
    ADD COLUMN team_lead_id uuid REFERENCES contacts(id) ON DELETE CASCADE;
    
    -- Add index for efficient team member lookups
    CREATE INDEX IF NOT EXISTS idx_contacts_team_lead_id 
    ON contacts(team_lead_id);
  END IF;
END $$;