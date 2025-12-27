/*
  # Fix campaign trigger URL error
  
  1. Changes
    - Create config table to store Supabase URL and anon key
    - Update trigger function to read from config table
    - Insert default configuration values
    
  2. Notes
    - Config table is restricted to service_role for security
    - Trigger function now reads from config table instead of current_setting
*/

-- Create config table to store Supabase credentials
CREATE TABLE IF NOT EXISTS _config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on config table
ALTER TABLE _config ENABLE ROW LEVEL SECURITY;

-- Only service_role can access config
CREATE POLICY "Only service_role can access config"
  ON _config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Insert Supabase URL and anon key
INSERT INTO _config (key, value)
VALUES 
  ('supabase_url', 'https://hsfgartycferbpmevtko.supabase.co'),
  ('supabase_anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzZmdhcnR5Y2ZlcmJwbWV2dGtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxMTkyNTksImV4cCI6MjA1MzY5NTI1OX0.G7EuZe736pAQGpxjUjBVRkNCbIrrL_hfuvucrD_DjMg')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Update trigger function to read from config table
CREATE OR REPLACE FUNCTION trigger_campaign_activation()
RETURNS TRIGGER AS $$
DECLARE
  request_id bigint;
  supabase_url text;
  supabase_anon_key text;
BEGIN
  -- Only trigger if is_active changed from false to true
  IF (TG_OP = 'UPDATE' AND OLD.is_active = false AND NEW.is_active = true) THEN
    
    -- Get Supabase URL and anon key from config table
    SELECT value INTO supabase_url FROM _config WHERE key = 'supabase_url';
    SELECT value INTO supabase_anon_key FROM _config WHERE key = 'supabase_anon_key';
    
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
