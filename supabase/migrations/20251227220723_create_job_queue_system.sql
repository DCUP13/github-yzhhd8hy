/*
  # Create job queue system for campaign automation

  1. New Tables
    - `job_queue` - Stores pending jobs to be processed by edge functions
      - `id` (uuid, primary key)
      - `job_type` (text) - Type of job (process_campaign, send_email, etc.)
      - `payload` (jsonb) - Job data
      - `status` (text) - Job status (pending, processing, completed, failed)
      - `error_message` (text) - Error details if job failed
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      - `processed_at` (timestamp)

  2. New Functions
    - `queue_campaign_processing` - Queues campaign processing job
    - `process_job_queue` - Processes pending jobs from queue

  3. New Triggers
    - Triggers on campaigns table to queue processing jobs

  4. Security
    - Enable RLS on job_queue table
    - Add policies for authenticated users
*/

-- Create job queue table
CREATE TABLE IF NOT EXISTS job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('process_campaign', 'send_email', 'process_outbox', 'scrape_agents')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
  ON job_queue FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs"
  ON job_queue FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all jobs"
  ON job_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_user_id ON job_queue(user_id);

-- Function to queue campaign processing
CREATE OR REPLACE FUNCTION queue_campaign_processing()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if is_active changed from false to true
  IF (TG_OP = 'UPDATE' AND OLD.is_active = false AND NEW.is_active = true) OR
     (TG_OP = 'INSERT' AND NEW.is_active = true) THEN
    
    INSERT INTO job_queue (job_type, payload, user_id)
    VALUES (
      'process_campaign',
      jsonb_build_object(
        'campaign_id', NEW.id,
        'user_id', NEW.user_id
      ),
      NEW.user_id
    );
    
    RAISE NOTICE 'Queued campaign processing job for campaign %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on campaigns table
DROP TRIGGER IF EXISTS campaigns_queue_trigger ON campaigns;
CREATE TRIGGER campaigns_queue_trigger
  AFTER INSERT OR UPDATE OF is_active
  ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION queue_campaign_processing();