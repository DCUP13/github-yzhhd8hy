/*
  # Remove Default Value for Email Delay

  1. Changes
    - Remove default value from send_delay_minutes column
    - Allow NULL values for send_delay_minutes
    - This allows users to manually set any value including 1
  
  2. Purpose
    - Give users full control over delay settings
    - Allow clearing the field completely
*/

-- Remove default value and allow NULL
ALTER TABLE campaigns 
ALTER COLUMN send_delay_minutes DROP DEFAULT,
ALTER COLUMN send_delay_minutes DROP NOT NULL;