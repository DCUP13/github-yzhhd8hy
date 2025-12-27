/*
  # Re-enable campaign activation trigger with scraping
  
  1. New Function
    - `trigger_campaign_activation` - Triggers scrape-agents and process-campaign when campaign is activated
    
  2. New Trigger
    - `campaigns_activation_trigger` - Fires when campaigns.is_active changes to true
    
  3. Notes
    - Calls scrape-agents first to gather contacts
    - Then calls process-campaign to generate emails
    - Runs asynchronously via pg_net to keep frontend responsive
*/

-- Ensure pg_net extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to trigger campaign activation workflow
CREATE OR REPLACE FUNCTION trigger_campaign_activation()
RETURNS TRIGGER AS $$
DECLARE
  request_id bigint;
  supabase_url text;
  supabase_anon_key text;
BEGIN
  -- Only trigger if is_active changed from false to true
  IF (TG_OP = 'UPDATE' AND OLD.is_active = false AND NEW.is_active = true) THEN
    
    -- Get Supabase URL from environment
    supabase_url := current_setting('app.settings.supabase_url', true);
    supabase_anon_key := current_setting('app.settings.supabase_anon_key', true);
    
    -- Fallback to request headers if settings not available
    IF supabase_url IS NULL THEN
      supabase_url := 'https://' || current_setting('request.headers', true)::json->>'host';
    END IF;
    
    -- Call scrape-agents edge function
    SELECT INTO request_id net.http_post(
      url := supabase_url || '/functions/v1/scrape-agents',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || supabase_anon_key
      ),
      body := jsonb_build_object(
        'campaign_id', NEW.id::text,
        'user_id', NEW.user_id::text
      )
    );
    
    -- Call process-campaign edge function
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

-- Create trigger on campaigns table
DROP TRIGGER IF EXISTS campaigns_activation_trigger ON campaigns;
CREATE TRIGGER campaigns_activation_trigger
  AFTER UPDATE OF is_active
  ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION trigger_campaign_activation();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA net TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA net TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA net TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA net TO postgres, anon, authenticated, service_role;
