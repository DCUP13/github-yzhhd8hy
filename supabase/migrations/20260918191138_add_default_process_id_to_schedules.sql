/*
# Add default_process_id to instagram_posting_schedules

1. Modified Tables
- `instagram_posting_schedules`: Add `default_process_id` uuid column
  (nullable, no FK) to store which saved Post Process should be used
  for automated daily posting on that account.

2. Security
- No new tables. Existing owner-scoped RLS policies on
  instagram_posting_schedules already cover the new column.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'instagram_posting_schedules' AND column_name = 'default_process_id'
  ) THEN
    ALTER TABLE instagram_posting_schedules ADD COLUMN default_process_id uuid;
  END IF;
END $$;