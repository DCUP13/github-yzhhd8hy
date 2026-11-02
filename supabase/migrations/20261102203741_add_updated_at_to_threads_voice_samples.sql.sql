/*
# Add updated_at column to threads_voice_samples

## Problem
The Threads Voice Library save function sends `updated_at` in its insert/update payload
(matching the LinkedIn voice samples pattern), but the `threads_voice_samples` table was
created without an `updated_at` column. This causes every save to fail with a column-not-found error.

## Changes
1. Adds `updated_at` column (timestamptz, defaults to now()) to `threads_voice_samples`.
2. Backfills existing rows so their `updated_at` matches `created_at`.

## Security
No security changes — RLS policies and grants on this table are unchanged.
*/

ALTER TABLE threads_voice_samples
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE threads_voice_samples SET updated_at = created_at WHERE updated_at IS NULL;
