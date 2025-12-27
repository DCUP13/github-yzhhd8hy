/*
  # Create automation triggers for campaign processing

  1. New Functions
    - `trigger_campaign_processing` - Function to call process-campaign edge function when campaign is activated
    - `trigger_email_sending` - Function to call send-email edge function when emails are added to outbox

  2. New Triggers
    - `campaigns_activation_trigger` - Triggers on campaigns table when is_active changes to true
    - `email_outbox_trigger` - Triggers on email_outbox table when new pending emails are inserted

  3. Notes
    - Uses pg_net extension to make HTTP requests to edge functions
    - Triggers run asynchronously to avoid blocking database operations
    - Edge functions handle the actual processing logic
*/

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to trigger campaign processing when campaign is activated
CREATE OR REPLACE FUNCTION trigger_campaign_processing()
RETURNS TRIGGER AS $$
DECLARE
  request_id bigint;
  supabase_url text;
  supabase_anon_key text;
BEGIN
  -- Only trigger if is_active changed from false to true
  IF (TG_OP = 'UPDATE' AND OLD.is_active = false AND NEW.is_active = true) OR
     (TG_OP = 'INSERT' AND NEW.is_active = true) THEN
    
    -- Get Supabase URL and anon key from environment
    supabase_url := current_setting('app.settings.supabase_url', true);
    supabase_anon_key := current_setting('app.settings.supabase_anon_key', true);
    
    -- If settings are not available, use default vault or skip
    IF supabase_url IS NULL THEN
      supabase_url := 'https://' || current_setting('request.headers', true)::json->>'host';
    END IF;
    
    -- Make async HTTP request to process-campaign edge function
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

-- Function to trigger email sending when emails are added to outbox
CREATE OR REPLACE FUNCTION trigger_email_sending()
RETURNS TRIGGER AS $$
DECLARE
  request_id bigint;
  supabase_url text;
  supabase_anon_key text;
BEGIN
  -- Only trigger for new pending emails
  IF NEW.status = 'pending' THEN
    
    -- Get Supabase URL and anon key
    supabase_url := current_setting('app.settings.supabase_url', true);
    supabase_anon_key := current_setting('app.settings.supabase_anon_key', true);
    
    IF supabase_url IS NULL THEN
      supabase_url := 'https://' || current_setting('request.headers', true)::json->>'host';
    END IF;
    
    -- Make async HTTP request to send-email edge function
    SELECT INTO request_id net.http_post(
      url := supabase_url || '/functions/v1/send-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || supabase_anon_key
      ),
      body := jsonb_build_object(
        'email_id', NEW.id::text,
        'user_id', NEW.user_id::text
      )
    );
    
    RAISE NOTICE 'Triggered email sending for email %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on campaigns table
DROP TRIGGER IF EXISTS campaigns_activation_trigger ON campaigns;
CREATE TRIGGER campaigns_activation_trigger
  AFTER INSERT OR UPDATE OF is_active
  ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION trigger_campaign_processing();

-- Create trigger on email_outbox table
DROP TRIGGER IF EXISTS email_outbox_trigger ON email_outbox;
CREATE TRIGGER email_outbox_trigger
  AFTER INSERT
  ON email_outbox
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION trigger_email_sending();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA net TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA net TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA net TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA net TO postgres, anon, authenticated, service_role;