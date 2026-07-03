
-- 1. Attach enforce trigger on escrow_orders so financial/status fields are guarded
DROP TRIGGER IF EXISTS enforce_escrow_order_update_trg ON public.escrow_orders;
CREATE TRIGGER enforce_escrow_order_update_trg
BEFORE UPDATE ON public.escrow_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_escrow_order_update();

-- 2. Remove counterparty read on farmers (exposes phone_e164). Buyers can use
-- server-side functions for any needed non-sensitive farmer details.
DROP POLICY IF EXISTS "Order counterparties read farmer" ON public.farmers;

-- 3. Block direct UPDATE/DELETE on order_otps from clients
CREATE POLICY "Deny client updates on order_otps"
  ON public.order_otps AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny client deletes on order_otps"
  ON public.order_otps AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "Deny client inserts on order_otps"
  ON public.order_otps AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (false);
