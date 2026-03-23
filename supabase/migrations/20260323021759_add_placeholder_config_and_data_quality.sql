/*
  # Add Placeholder Configuration and Data Quality Settings

  1. New Tables
    - `placeholder_config`
      - Stores configuration for each template placeholder
      - Defines priority tier (critical/important/optional)
      - Defines fallback text for missing data
      - Links to user for custom configurations
    - `default_placeholder_config`
      - System-wide default configurations for placeholders

  2. Changes to Existing Tables
    - `campaigns`
      - Add `min_data_quality_score` (0-100, default 50)
      - Add `skip_incomplete_contacts` (boolean, default false)
      - Add `use_smart_fallbacks` (boolean, default true)
    - `contacts`
      - Add `data_quality_score` (calculated score 0-100)
      - Add `missing_fields` (JSON array of missing placeholder keys)
    - `email_outbox`
      - Add `skipped` (boolean, default false)
      - Add `skip_reason` (text explaining why contact was skipped)

  3. Security
    - Enable RLS on placeholder_config table
    - Add policies for authenticated users to manage their configs
*/

-- Create placeholder_config table
CREATE TABLE IF NOT EXISTS placeholder_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  placeholder_key text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('critical', 'important', 'optional')),
  fallback_text text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, placeholder_key)
);

ALTER TABLE placeholder_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own placeholder configs"
  ON placeholder_config FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own placeholder configs"
  ON placeholder_config FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own placeholder configs"
  ON placeholder_config FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own placeholder configs"
  ON placeholder_config FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add data quality settings to campaigns table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'min_data_quality_score'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN min_data_quality_score integer DEFAULT 50 CHECK (min_data_quality_score >= 0 AND min_data_quality_score <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'skip_incomplete_contacts'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN skip_incomplete_contacts boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'use_smart_fallbacks'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN use_smart_fallbacks boolean DEFAULT true;
  END IF;
END $$;

-- Insert default placeholder configurations
-- These are system defaults that users can override
CREATE TABLE IF NOT EXISTS default_placeholder_config (
  placeholder_key text PRIMARY KEY,
  tier text NOT NULL CHECK (tier IN ('critical', 'important', 'optional')),
  fallback_text text DEFAULT '',
  description text
);

INSERT INTO default_placeholder_config (placeholder_key, tier, fallback_text, description) VALUES
  ('first_name', 'critical', 'there', 'Contact first name'),
  ('last_name', 'critical', '', 'Contact last name'),
  ('email', 'critical', '', 'Contact email address'),
  ('full_name', 'critical', 'there', 'Contact full name'),

  ('listing_address', 'important', 'the property', 'Property address'),
  ('listing_price', 'important', 'competitive market price', 'Listing price'),
  ('listing_bedrooms', 'important', 'multiple bedrooms', 'Number of bedrooms'),
  ('listing_bathrooms', 'important', 'multiple bathrooms', 'Number of bathrooms'),
  ('listing_sqft', 'important', 'spacious square footage', 'Property square footage'),

  ('phone', 'optional', '', 'Contact phone number'),
  ('business_name', 'optional', 'your company', 'Business or company name'),
  ('listing_city', 'optional', '', 'Property city'),
  ('listing_state', 'optional', '', 'Property state'),
  ('listing_zip', 'optional', '', 'Property ZIP code'),
  ('listing_type', 'optional', 'property', 'Property type')
ON CONFLICT (placeholder_key) DO NOTHING;

-- Add metadata columns to contacts for tracking data quality
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'data_quality_score'
  ) THEN
    ALTER TABLE contacts ADD COLUMN data_quality_score integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'missing_fields'
  ) THEN
    ALTER TABLE contacts ADD COLUMN missing_fields jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add skip reason to email_outbox for tracking why contacts weren't sent emails
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_outbox' AND column_name = 'skipped'
  ) THEN
    ALTER TABLE email_outbox ADD COLUMN skipped boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_outbox' AND column_name = 'skip_reason'
  ) THEN
    ALTER TABLE email_outbox ADD COLUMN skip_reason text;
  END IF;
END $$;