/*
  # Add phone fields and listings table
  
  ## Changes to contacts table
    - Add `phone_cell` (text) - Agent's cell phone
    - Add `phone_brokerage` (text) - Agent's brokerage phone
    - Add `phone_business` (text) - Agent's business phone
    - Add `is_team_lead` (boolean) - Whether agent is a team lead
    - Add `encoded_zuid` (text) - Agent's encoded ZUID
    
  ## New Tables
    - `listings`
      - `id` (uuid, primary key)
      - `contact_id` (uuid, foreign key to contacts)
      - `user_id` (uuid, foreign key to profiles)
      - `zpid` (bigint) - Zillow property ID
      - `home_type` (text) - Type of home
      - `address_line1` (text)
      - `address_line2` (text)
      - `city` (text)
      - `state` (text)
      - `postal_code` (text)
      - `bedrooms` (integer)
      - `bathrooms` (numeric)
      - `price` (integer)
      - `price_currency` (text)
      - `status` (text)
      - `latitude` (numeric)
      - `longitude` (numeric)
      - `brokerage_name` (text)
      - `listing_url` (text)
      - `primary_photo_url` (text)
      - `open_houses` (text)
      - `has_open_house` (boolean)
      - `has_vr_model` (boolean)
      - `living_area_value` (integer)
      - `living_area_units` (text)
      - `listing_data` (jsonb) - Full listing data
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      
  ## Security
    - Enable RLS on `listings` table
    - Add policies for authenticated users to access their own listings
*/

-- Add new columns to contacts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'phone_cell'
  ) THEN
    ALTER TABLE contacts ADD COLUMN phone_cell text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'phone_brokerage'
  ) THEN
    ALTER TABLE contacts ADD COLUMN phone_brokerage text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'phone_business'
  ) THEN
    ALTER TABLE contacts ADD COLUMN phone_business text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'is_team_lead'
  ) THEN
    ALTER TABLE contacts ADD COLUMN is_team_lead boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'encoded_zuid'
  ) THEN
    ALTER TABLE contacts ADD COLUMN encoded_zuid text DEFAULT '';
  END IF;
END $$;

-- Create listings table
CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  zpid bigint,
  home_type text DEFAULT '',
  address_line1 text DEFAULT '',
  address_line2 text DEFAULT '',
  city text DEFAULT '',
  state text DEFAULT '',
  postal_code text DEFAULT '',
  bedrooms integer,
  bathrooms numeric,
  price integer,
  price_currency text DEFAULT 'usd',
  status text DEFAULT '',
  latitude numeric,
  longitude numeric,
  brokerage_name text DEFAULT '',
  listing_url text DEFAULT '',
  primary_photo_url text DEFAULT '',
  open_houses text DEFAULT '',
  has_open_house boolean DEFAULT false,
  has_vr_model boolean DEFAULT false,
  living_area_value integer,
  living_area_units text DEFAULT 'sqft',
  listing_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own listings"
  ON listings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own listings"
  ON listings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own listings"
  ON listings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own listings"
  ON listings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_listings_contact_id ON listings(contact_id);
CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id);
CREATE INDEX IF NOT EXISTS idx_listings_zpid ON listings(zpid);