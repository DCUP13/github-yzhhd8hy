/*
  # Add Campaign ID to Email Outbox

  1. Changes
    - Add `campaign_id` column to `email_outbox` table
    - Add foreign key constraint to campaigns table
    - Add index for better query performance
  
  2. Purpose
    - Track which campaign each outbox email belongs to
    - Enable campaign-specific sending schedules and delays
    - Allow filtering outbox emails by campaign
*/

-- Add campaign_id column to email_outbox
ALTER TABLE email_outbox 
ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE;

-- Add index for campaign_id
CREATE INDEX IF NOT EXISTS idx_email_outbox_campaign_id ON email_outbox(campaign_id);

-- Also add to email_sent for tracking
ALTER TABLE email_sent 
ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_email_sent_campaign_id ON email_sent(campaign_id);