/*
  # Add name column to profiles

  Adds a `name` text column to profiles so the team page can display
  the user's display name alongside their email.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'name') THEN
    ALTER TABLE profiles ADD COLUMN name text;
  END IF;
END $$;
