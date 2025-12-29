/*
  # Fix duplicate scrape-agents calls
  
  1. Changes
    - Remove scrape-agents call from trigger function
    - Let process-campaign handle scraping (it checks for existing contacts first)
  
  2. Notes
    - Previously, the trigger called both scrape-agents AND process-campaign
    - This caused scrape-agents to run twice: once from trigger, once from process-campaign
    - Now only process-campaign is called, which internally handles scraping if needed
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
    
    RAISE NOTICE 'Triggered campaign activation for campaign %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;