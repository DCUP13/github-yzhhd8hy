/*
  # Add processing status to contacts check constraint

  1. Changes
    - Extend contacts.status check constraint to allow 'processing'
    - Used to atomically claim a contact during draft generation and prevent double-drafting
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'contacts' AND constraint_name = 'contacts_status_check'
  ) THEN
    ALTER TABLE contacts DROP CONSTRAINT contacts_status_check;
  END IF;

  ALTER TABLE contacts ADD CONSTRAINT contacts_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'failed'::text, 'emailed'::text]));
END $$;
