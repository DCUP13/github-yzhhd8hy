/*
  # Email Drafts and Test Mode

  1. New Tables
    - `email_drafts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `campaign_id` (uuid, foreign key to campaigns)
      - `to_email` (text, recipient email)
      - `from_email` (text, sender email)
      - `subject` (text, email subject)
      - `body` (text, email body)
      - `attachments` (jsonb, array of attachment info)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `general_settings`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles, unique)
      - `test_mode_enabled` (boolean, default false)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage their own data

  3. Indexes
    - Add indexes for user_id and campaign_id for better performance
*/

-- Create email_drafts table
CREATE TABLE IF NOT EXISTS email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  from_email text NOT NULL,
  subject text,
  body text,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create general_settings table
CREATE TABLE IF NOT EXISTS general_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  test_mode_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE general_settings ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_drafts_user_id ON email_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_campaign_id ON email_drafts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_general_settings_user_id ON general_settings(user_id);

-- RLS Policies for email_drafts
CREATE POLICY "Users can read own draft emails"
  ON email_drafts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own draft emails"
  ON email_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own draft emails"
  ON email_drafts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own draft emails"
  ON email_drafts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for general_settings
CREATE POLICY "Users can read own general settings"
  ON general_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own general settings"
  ON general_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own general settings"
  ON general_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);