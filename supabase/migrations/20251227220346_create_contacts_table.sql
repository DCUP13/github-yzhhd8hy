/*
  # Create contacts table for scraped agents

  1. New Tables
    - `contacts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `campaign_id` (uuid, foreign key to campaigns)
      - `email` (text) - Agent's email address
      - `name` (text) - Agent's full name
      - `screen_name` (text) - Agent's Zillow screen name
      - `phone` (text) - Agent's phone number
      - `business_name` (text) - Agent's business/team name
      - `profile_url` (text) - Agent's profile URL
      - `status` (text) - Contact processing status (pending, processed, failed)
      - `agent_data` (jsonb) - Full agent data from API
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `contacts` table
    - Add policies for authenticated users to manage their own contacts
*/

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text DEFAULT '',
  screen_name text DEFAULT '',
  phone text DEFAULT '',
  business_name text DEFAULT '',
  profile_url text DEFAULT '',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'emailed')),
  agent_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contacts"
  ON contacts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts"
  ON contacts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts"
  ON contacts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts"
  ON contacts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_campaign_id ON contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);