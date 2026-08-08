-- Allow users to update (accept) invitations matching their own email
CREATE POLICY "users_update_own_invitation"
  ON public.member_invitations FOR UPDATE
  TO authenticated
  USING (email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (email = (SELECT email FROM public.profiles WHERE id = auth.uid()));
