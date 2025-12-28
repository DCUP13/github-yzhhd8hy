/*
  # Update Delay Constraint

  1. Changes
    - Drop the positive check constraint for send_delay_minutes
    - Add new constraint that only checks if value is positive when NOT NULL
  
  2. Purpose
    - Allow NULL values while still enforcing positive numbers when set
*/

-- Drop old constraint if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'campaigns_delay_positive_check'
  ) THEN
    ALTER TABLE campaigns DROP CONSTRAINT campaigns_delay_positive_check;
  END IF;
END $$;

-- Add new constraint that allows NULL but requires positive when set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'campaigns_delay_positive_or_null_check'
  ) THEN
    ALTER TABLE campaigns 
    ADD CONSTRAINT campaigns_delay_positive_or_null_check 
    CHECK (send_delay_minutes IS NULL OR send_delay_minutes > 0);
  END IF;
END $$;