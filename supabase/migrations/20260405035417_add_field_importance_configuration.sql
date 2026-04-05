/*
  # Field Importance Configuration System

  This migration implements a flexible field importance and data quality system for campaigns.

  ## New Tables
  
  1. **field_importance_config**
     - Stores global default importance levels for contact fields
     - `id` (uuid, primary key)
     - `user_id` (uuid, references auth.users)
     - `field_name` (text) - name of the contact field
     - `importance_level` (text) - 'required', 'important', or 'optional'
     - `weight` (integer) - weight for quality score calculation (1-10)
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)

  2. **campaign_field_overrides**
     - Stores per-campaign field requirement overrides
     - `id` (uuid, primary key)
     - `campaign_id` (uuid, references campaigns)
     - `field_name` (text)
     - `importance_level` (text)
     - `created_at` (timestamptz)

  ## New Columns
  
  1. **campaigns table**
     - `minimum_quality_score` (integer) - minimum data quality % to send to contact
     - `auto_detect_fields` (boolean) - whether to auto-detect required fields from template
     - `data_quality_report` (jsonb) - cached data quality analysis

  ## Security
  
  - Enable RLS on all new tables
  - Users can only access their own field configurations
  - Users can only access field overrides for their own campaigns

  ## Indexes
  
  - Index on user_id for fast lookups
  - Unique constraint on user_id + field_name combination
  - Index on campaign_id for overrides
*/

-- Create field_importance_config table
CREATE TABLE IF NOT EXISTS field_importance_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  importance_level text NOT NULL CHECK (importance_level IN ('required', 'important', 'optional')),
  weight integer NOT NULL DEFAULT 5 CHECK (weight >= 1 AND weight <= 10),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, field_name)
);

-- Create campaign_field_overrides table
CREATE TABLE IF NOT EXISTS campaign_field_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  importance_level text NOT NULL CHECK (importance_level IN ('required', 'important', 'optional')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, field_name)
);

-- Add new columns to campaigns table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'minimum_quality_score'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN minimum_quality_score integer DEFAULT 0 CHECK (minimum_quality_score >= 0 AND minimum_quality_score <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'auto_detect_fields'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN auto_detect_fields boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'data_quality_report'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN data_quality_report jsonb;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_field_importance_user_id ON field_importance_config(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_field_overrides_campaign_id ON campaign_field_overrides(campaign_id);

-- Enable RLS
ALTER TABLE field_importance_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_field_overrides ENABLE ROW LEVEL SECURITY;

-- RLS Policies for field_importance_config
CREATE POLICY "Users can view own field importance config"
  ON field_importance_config FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own field importance config"
  ON field_importance_config FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own field importance config"
  ON field_importance_config FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own field importance config"
  ON field_importance_config FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for campaign_field_overrides
CREATE POLICY "Users can view overrides for own campaigns"
  ON campaign_field_overrides FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_field_overrides.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert overrides for own campaigns"
  ON campaign_field_overrides FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_field_overrides.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update overrides for own campaigns"
  ON campaign_field_overrides FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_field_overrides.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_field_overrides.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete overrides for own campaigns"
  ON campaign_field_overrides FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_field_overrides.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_field_importance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for field_importance_config
DROP TRIGGER IF EXISTS update_field_importance_config_updated_at ON field_importance_config;
CREATE TRIGGER update_field_importance_config_updated_at
  BEFORE UPDATE ON field_importance_config
  FOR EACH ROW
  EXECUTE FUNCTION update_field_importance_updated_at();

-- Insert default field importance configuration
-- This creates sensible defaults for common contact fields
INSERT INTO field_importance_config (user_id, field_name, importance_level, weight)
SELECT 
  id,
  'email',
  'required',
  10
FROM auth.users
ON CONFLICT (user_id, field_name) DO NOTHING;

INSERT INTO field_importance_config (user_id, field_name, importance_level, weight)
SELECT 
  id,
  unnest(ARRAY['first_name', 'last_name', 'phone']),
  'important',
  7
FROM auth.users
ON CONFLICT (user_id, field_name) DO NOTHING;

INSERT INTO field_importance_config (user_id, field_name, importance_level, weight)
SELECT 
  id,
  unnest(ARRAY['company', 'title', 'address', 'city', 'state', 'zip']),
  'optional',
  3
FROM auth.users
ON CONFLICT (user_id, field_name) DO NOTHING;