
-- Fix: farmers phone/location exposed to all authenticated users
DROP POLICY IF EXISTS "Farmers readable by signed-in users" ON public.farmers;

CREATE POLICY "Farmer reads own profile"
ON public.farmers FOR SELECT TO authenticated
USING (id = auth.uid());

CREATE POLICY "Order counterparties read farmer"
ON public.farmers FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.escrow_orders o
  WHERE o.farmer_id = farmers.id
    AND o.buyer_id = auth.uid()
));

-- Public browsable view without phone/precise coordinates for product discovery
CREATE OR REPLACE VIEW public.farmers_public
WITH (security_invoker = true) AS
SELECT id, full_name, farm_name, avatar_url, location_label,
       crops, livestock, expected_supply, onboarded_at, created_at
FROM public.farmers;

GRANT SELECT ON public.farmers_public TO authenticated;

-- Because the view relies on the base table's RLS via security_invoker,
-- add a permissive SELECT policy that lets authenticated users see only
-- the non-sensitive columns through the view. We enforce this by making
-- the view's columns fixed (phone_e164/lat/lng excluded above) and adding
-- a broad SELECT policy scoped to authenticated. However that would still
-- expose the table directly. Instead, drop security_invoker so the view
-- runs as its owner and exposes only listed columns.
DROP VIEW public.farmers_public;
CREATE VIEW public.farmers_public AS
SELECT id, full_name, farm_name, avatar_url, location_label,
       crops, livestock, expected_supply, onboarded_at, created_at
FROM public.farmers;
GRANT SELECT ON public.farmers_public TO authenticated;

-- Fix: marketplace_chats identity columns should be immutable on UPDATE
CREATE OR REPLACE FUNCTION public.enforce_marketplace_chat_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.id <> OLD.id
     OR NEW.buyer_id <> OLD.buyer_id
     OR NEW.farmer_id <> OLD.farmer_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'cannot modify identity fields on marketplace_chats';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_marketplace_chats_enforce_update ON public.marketplace_chats;
CREATE TRIGGER trg_marketplace_chats_enforce_update
BEFORE UPDATE ON public.marketplace_chats
FOR EACH ROW EXECUTE FUNCTION public.enforce_marketplace_chat_update();

-- Fix: order_otps code_hash exposed to buyers.
-- Remove the client-facing SELECT policy entirely; OTP verification must
-- happen server-side via a SECURITY DEFINER function.
DROP POLICY IF EXISTS "Buyer reads own OTP metadata" ON public.order_otps;

-- Buyer-facing metadata (no code_hash / sent_to_phone) via definer function
CREATE OR REPLACE FUNCTION public.get_order_otp_status(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.escrow_orders o WHERE o.id = p_order_id AND o.buyer_id = v_uid) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT jsonb_build_object(
    'id', id, 'order_id', order_id, 'sent_at', sent_at,
    'expires_at', expires_at, 'consumed_at', consumed_at, 'attempts', attempts
  ) INTO v FROM public.order_otps WHERE order_id = p_order_id
    ORDER BY sent_at DESC LIMIT 1;
  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_order_otp_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_otp_status(uuid) TO authenticated;
