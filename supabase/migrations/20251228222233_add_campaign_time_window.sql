/*
  # Add Campaign Time Window and Delay Settings

  1. Changes
    - Add `send_time_start` column (time) - Start time for sending emails (e.g., 09:00:00)
    - Add `send_time_end` column (time) - End time for sending emails (e.g., 17:00:00)
    - Add `send_delay_minutes` column (integer) - Delay in minutes between each email
    - Default values:
      - send_time_start: 09:00:00 (9 AM)
      - send_time_end: 17:00:00 (5 PM)
      - send_delay_minutes: 5 (5 minutes between emails)
  
  2. Purpose
    - Allow campaigns to specify active hours for email sending
    - Enable rate limiting via configurable delays between emails
    - Support daily capacity calculations based on time window and delay
*/

-- Add time window columns to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS send_time_start TIME DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS send_time_end TIME DEFAULT '17:00:00',
ADD COLUMN IF NOT EXISTS send_delay_minutes INTEGER DEFAULT 5;

-- Add check constraint to ensure end time is after start time
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'campaigns_time_window_check'
  ) THEN
    ALTER TABLE campaigns 
    ADD CONSTRAINT campaigns_time_window_check 
    CHECK (send_time_end > send_time_start);
  END IF;
END $$;

-- Add check constraint to ensure delay is positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'campaigns_delay_positive_check'
  ) THEN
    ALTER TABLE campaigns 
    ADD CONSTRAINT campaigns_delay_positive_check 
    CHECK (send_delay_minutes > 0);
  END IF;
END $$;