-- Only owners should be able to change organization settings (including the name).
-- Managers and members can view but not edit.
DROP POLICY IF EXISTS "members_update_own_org" ON public.organizations;
CREATE POLICY "owner_update_own_org"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.role = 'owner'
      AND om.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.role = 'owner'
      AND om.status = 'active'
  ));