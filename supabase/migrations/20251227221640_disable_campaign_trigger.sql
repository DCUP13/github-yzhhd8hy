/*
  # Disable campaign activation trigger

  1. Changes
    - Drop the campaigns_activation_trigger to prevent conflicts with frontend activation logic
    - The frontend now directly calls scrape-agents and process-campaign edge functions
    
  2. Notes
    - Email outbox trigger remains active for processing outbound emails
*/

-- Drop the problematic campaign activation trigger
DROP TRIGGER IF EXISTS campaigns_activation_trigger ON campaigns;

-- Optionally drop the function if no longer needed
DROP FUNCTION IF EXISTS trigger_campaign_processing();
