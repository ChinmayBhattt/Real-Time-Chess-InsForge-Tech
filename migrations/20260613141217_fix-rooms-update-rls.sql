-- Fix rooms_update policy to allow guests to join rooms.
-- Currently, it checks `USING (host_id = auth.uid() OR guest_id = auth.uid())` which fails for users who are not yet the guest.
-- We update the policy to allow updates if the guest_id is null and status is 'waiting' (so a user can join),
-- and we enforce that the guest can only set themselves as the guest via WITH CHECK.

DROP POLICY IF EXISTS rooms_update ON public.rooms;

CREATE POLICY rooms_update ON public.rooms
  FOR UPDATE TO authenticated
  USING (host_id = auth.uid() OR guest_id = auth.uid() OR (guest_id IS NULL AND status = 'waiting'))
  WITH CHECK (host_id = auth.uid() OR guest_id = auth.uid());
