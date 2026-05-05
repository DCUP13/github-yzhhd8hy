/*
  # Add atomic scrape lock acquisition RPC

  Using an RPC avoids PostgREST column-cache issues that were blocking the
  direct `.update().or()` call. The function atomically takes the lock if it's
  free or expired, and returns the current scrape state so the edge function
  can proceed without a second query.
*/

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
  scrape_index int
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
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::jsonb, NULL::int, NULL::boolean, NULL::int;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    v_row.city,
    v_row.is_active,
    v_row.scrape_screen_names,
    v_row.scrape_list_page,
    v_row.scrape_list_complete,
    v_row.scrape_index;
END;
$$;

CREATE OR REPLACE FUNCTION release_scrape_lock(p_campaign_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE campaigns SET scrape_locked_until = NULL WHERE id = p_campaign_id;
$$;

NOTIFY pgrst, 'reload schema';
