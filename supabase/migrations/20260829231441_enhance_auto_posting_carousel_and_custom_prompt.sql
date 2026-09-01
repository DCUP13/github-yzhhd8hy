/*
# Enhance Auto-Posting: Carousel Text Lines, Custom Prompts, Post-Now, Test Posts

## Overview
This migration adds columns to support carousel posts with per-image text overlays,
custom inline prompts (instead of selecting from the prompts table), immediate posting,
and test posts that run outside the schedule.

## Changes to instagram_post_batches
- custom_prompt (text, nullable): user can type their own AI prompt inline instead of
  selecting one from the prompts table. When set, this takes precedence over prompt_id.
- carousel_size (integer, default 1): now represents the number of photos/videos per
  carousel post. The auto-poster will select this many random assets from the library.
- carousel_text_lines (text array, default '{}'): predetermined text lines to overlay
  on each carousel image. Line 1 goes on image 1, line 2 on image 2, etc. When the
  user sets 5 photos per post, they provide up to 5 text lines.
- post_now (boolean, default false): when true, generated variations are published
  immediately instead of going to staging.
- use_whole_library (boolean, default true): when true, the system randomly selects
  assets from the entire library rather than from a manually selected subset.

## Changes to instagram_post_variations
- carousel_texts (text array, default '{}'): the text lines applied to each image
  in this variation's carousel, copied from the batch at generation time.
- is_test_post (boolean, default false): marks this variation as a test post that
  was published out of schedule for preview purposes.
- source_filename (text, nullable): stores the original uploaded filename for
  reference, separate from the unique S3 key.

## Security
- No new tables. Existing RLS policies on both tables already cover the new columns
  since they use per-row user_id ownership checks.
*/

-- Add columns to instagram_post_batches
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_post_batches' AND column_name = 'custom_prompt') THEN
    ALTER TABLE instagram_post_batches ADD COLUMN custom_prompt text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_post_batches' AND column_name = 'carousel_text_lines') THEN
    ALTER TABLE instagram_post_batches ADD COLUMN carousel_text_lines text[] DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_post_batches' AND column_name = 'post_now') THEN
    ALTER TABLE instagram_post_batches ADD COLUMN post_now boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_post_batches' AND column_name = 'use_whole_library') THEN
    ALTER TABLE instagram_post_batches ADD COLUMN use_whole_library boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- Add columns to instagram_post_variations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_post_variations' AND column_name = 'carousel_texts') THEN
    ALTER TABLE instagram_post_variations ADD COLUMN carousel_texts text[] DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_post_variations' AND column_name = 'is_test_post') THEN
    ALTER TABLE instagram_post_variations ADD COLUMN is_test_post boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_post_variations' AND column_name = 'source_filename') THEN
    ALTER TABLE instagram_post_variations ADD COLUMN source_filename text;
  END IF;
END $$;

-- Update the default for carousel_size to 1 (already exists, but ensure it's set)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_post_batches' AND column_name = 'carousel_size' AND column_default IS NULL) THEN
    ALTER TABLE instagram_post_batches ALTER COLUMN carousel_size SET DEFAULT 1;
  END IF;
END $$;