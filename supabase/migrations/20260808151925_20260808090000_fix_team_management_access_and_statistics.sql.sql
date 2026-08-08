-- Keep organization settings and member management server-authorized.
DROP POLICY IF EXISTS "members_update_own_org" ON public.organizations;
CREATE POLICY "members_update_own_org"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'manager')
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'manager')
      AND om.status = 'active'
  ));

CREATE OR REPLACE FUNCTION public.get_member_statistics(p_member_id uuid)
RETURNS TABLE (
  total_sent bigint,
  total_opens bigint,
  total_replies bigint,
  campaigns_run bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT om.organization_id INTO v_org_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
    AND om.status = 'active'
    AND om.role IN ('owner', 'manager')
    AND EXISTS (
      SELECT 1 FROM public.organization_members target
      WHERE target.organization_id = om.organization_id
        AND target.user_id = p_member_id
        AND target.status = 'active'
    )
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.email_sent es WHERE es.user_id = p_member_id),
    (SELECT count(*)
       FROM public.email_events ee
       JOIN public.email_sent es ON es.id = ee.email_sent_id
      WHERE es.user_id = p_member_id AND ee.event_type = 'open'),
    (SELECT count(*)
       FROM public.emails e
       JOIN public.email_sent es ON es.id = e.reply_to_sent_id
      WHERE es.user_id = p_member_id),
    (SELECT count(*) FROM public.campaigns c WHERE c.user_id = p_member_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_statistics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_statistics(uuid) TO authenticated;