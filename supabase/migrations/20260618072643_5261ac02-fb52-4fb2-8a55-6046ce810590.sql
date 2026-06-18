
-- Block direct client writes to reversals. All mutations must go through SECURITY DEFINER server logic.
CREATE POLICY "Block direct client inserts on reversals"
ON public.reversals
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Block direct client updates on reversals"
ON public.reversals
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Block direct client deletes on reversals"
ON public.reversals
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (false);
