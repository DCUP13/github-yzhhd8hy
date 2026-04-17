/*
  # Add name parsing helper and generated columns to contacts

  1. New Functions
    - `parse_first_name(full_name text)` - extracts first name while stripping titles (Mr., Mrs., Dr., etc.)
    - `parse_last_name(full_name text)` - extracts last name while stripping suffixes (Jr., Sr., II, III, etc.)

  2. Schema Changes
    - `contacts.first_name_parsed` (generated) - derived from name column using parse_first_name
    - `contacts.last_name_parsed` (generated) - derived from name column using parse_last_name

  3. Security
    - Functions are IMMUTABLE and SECURITY INVOKER (safe default)
    - No RLS changes needed; generated columns inherit existing contacts RLS

  Notes:
    1. Generated columns are read-only and auto-populated
    2. Existing contacts will have name parts computed automatically
    3. Functions handle edge cases: empty names, single names, multiple middle names
*/

CREATE OR REPLACE FUNCTION parse_first_name(full_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned text;
  tokens text[];
  titles text[] := ARRAY['mr','mrs','ms','miss','dr','prof','rev','sir','madam','mx'];
  first_token text;
BEGIN
  cleaned := btrim(coalesce(full_name, ''));
  IF cleaned = '' THEN
    RETURN '';
  END IF;

  tokens := regexp_split_to_array(cleaned, '\s+');

  IF array_length(tokens, 1) > 1 THEN
    first_token := lower(regexp_replace(tokens[1], '[.,]', '', 'g'));
    IF first_token = ANY(titles) THEN
      tokens := tokens[2:array_length(tokens, 1)];
    END IF;
  END IF;

  IF array_length(tokens, 1) IS NULL THEN
    RETURN '';
  END IF;

  RETURN tokens[1];
END;
$$;

CREATE OR REPLACE FUNCTION parse_last_name(full_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned text;
  tokens text[];
  titles text[] := ARRAY['mr','mrs','ms','miss','dr','prof','rev','sir','madam','mx'];
  suffixes text[] := ARRAY['jr','sr','ii','iii','iv','v','phd','md','esq','dds','cpa'];
  first_token text;
  last_token text;
  n int;
BEGIN
  cleaned := btrim(coalesce(full_name, ''));
  IF cleaned = '' THEN
    RETURN '';
  END IF;

  tokens := regexp_split_to_array(cleaned, '\s+');

  IF array_length(tokens, 1) > 1 THEN
    first_token := lower(regexp_replace(tokens[1], '[.,]', '', 'g'));
    IF first_token = ANY(titles) THEN
      tokens := tokens[2:array_length(tokens, 1)];
    END IF;
  END IF;

  n := array_length(tokens, 1);
  IF n IS NULL OR n < 2 THEN
    RETURN '';
  END IF;

  last_token := lower(regexp_replace(tokens[n], '[.,]', '', 'g'));
  IF last_token = ANY(suffixes) AND n > 2 THEN
    RETURN tokens[n - 1];
  END IF;

  RETURN tokens[n];
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'first_name_parsed'
  ) THEN
    ALTER TABLE contacts
      ADD COLUMN first_name_parsed text
      GENERATED ALWAYS AS (parse_first_name(name)) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'last_name_parsed'
  ) THEN
    ALTER TABLE contacts
      ADD COLUMN last_name_parsed text
      GENERATED ALWAYS AS (parse_last_name(name)) STORED;
  END IF;
END $$;
