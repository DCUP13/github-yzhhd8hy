/*
  # Fix duplicate scrape-agents calls in campaign trigger
  
  1. Changes
    - Update trigger_campaign_activation to ONLY call process-campaign
    - Remove direct scrape-agents call from trigger
    - process-campaign handles scraping internally with proper checks
  
  2. Security
    - No changes to RLS policies
  
  3. Notes
    - This prevents duplicate API calls that cause rate limiting
    - process-campaign checks if contacts exist before scraping
*/

CREATE OR REPLACE FUNCTION trigger_campaign_activation()
RETURNS TRIGGER AS $$
DECLARE
  request_id bigint;
  supabase_url text;
  supabase_anon_key text;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.is_active = false AND NEW.is_active = true) THEN
    
    SELECT value INTO supabase_url FROM _config WHERE key = 'supabase_url';
    SELECT value INTO supabase_anon_key FROM _config WHERE key = 'supabase_anon_key';
    
    -- Only call process-campaign, which handles scraping internally
    SELECT INTO request_id net.http_post(
      url := supabase_url || '/functions/v1/process-campaign',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || supabase_anon_key
      ),
      body := jsonb_build_object(
        'campaign_id', NEW.id::text,
        'user_id', NEW.user_id::text
      )
    );
    
    RAISE NOTICE 'Triggered campaign processing for campaign %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
