/*
  # Update acquire_scrape_lock RPC to return team member fields

  1. Changes
    - Drop and recreate function with additional return columns
    - Add scrape_team_members, scrape_team_index, scrape_last_page_count to return type
  
  2. Purpose
    - The edge function needs these fields to process team members
    - Without them, team member processing was being skipped entirely
*/

DROP FUNCTION IF EXISTS acquire_scrape_lock(uuid, uuid, int);

CREATE OR REPLACE FUNCTION acquire_scrape_lock(
  p_campaign_id uuid,
  p_user_id uuid,
  p_lock_seconds int DEFAULT 30
)
RETURNS TABLE (
  locked boolean,
  city text,
  is_active boolean,
  scrape_screen_names jsonb,
  scrape_list_page int,
  scrape_list_complete boolean,
  scrape_index int,
  scrape_team_members jsonb,
  scrape_team_index int,
  scrape_last_page_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row campaigns%ROWTYPE;
BEGIN
  UPDATE campaigns
    SET scrape_locked_until = now() + make_interval(secs => p_lock_seconds)
    WHERE id = p_campaign_id
      AND user_id = p_user_id
      AND (scrape_locked_until IS NULL OR scrape_locked_until < now())
    RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::jsonb, NULL::int, NULL::boolean, NULL::int, NULL::jsonb, NULL::int, NULL::int;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    v_row.city,
    v_row.is_active,
    v_row.scrape_screen_names,
    v_row.scrape_list_page,
    v_row.scrape_list_complete,
    v_row.scrape_index,
    v_row.scrape_team_members,
    v_row.scrape_team_index,
    v_row.scrape_last_page_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
