
-- 1) Revoke anon EXECUTE on SECURITY DEFINER functions that require auth
REVOKE EXECUTE ON FUNCTION public.send_invoice(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_invoice(text, text, currency_code, date, jsonb, numeric, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_invoice_reminder(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_pin(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_pin(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_pin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_transaction(text, tx_type, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_fx_conversion(text, currency_code, currency_code, bigint) FROM PUBLIC, anon;

-- 2) Escrow orders: restrict which columns each party can update via trigger
CREATE OR REPLACE FUNCTION public.enforce_escrow_order_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Immutable fields for everyone
  IF NEW.id <> OLD.id
     OR NEW.buyer_id <> OLD.buyer_id
     OR NEW.farmer_id <> OLD.farmer_id
     OR NEW.product_id <> OLD.product_id
     OR NEW.chat_id IS DISTINCT FROM OLD.chat_id
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'cannot modify immutable order fields';
  END IF;

  IF v_uid = OLD.buyer_id AND v_uid = OLD.farmer_id THEN
    -- Shouldn't happen, but allow
    RETURN NEW;
  END IF;

  IF v_uid = OLD.buyer_id THEN
    -- Buyer may only touch destination, rating/feedback, and buyer-driven status transitions
    IF NEW.quantity <> OLD.quantity
       OR NEW.unit_price_minor <> OLD.unit_price_minor
       OR NEW.product_subtotal_minor <> OLD.product_subtotal_minor
       OR NEW.delivery_fee_minor <> OLD.delivery_fee_minor
       OR NEW.platform_fee_minor <> OLD.platform_fee_minor
       OR NEW.total_minor <> OLD.total_minor
       OR NEW.currency <> OLD.currency
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.in_transit_at IS DISTINCT FROM OLD.in_transit_at
       OR NEW.arrived_at IS DISTINCT FROM OLD.arrived_at THEN
      RAISE EXCEPTION 'buyer cannot modify pricing or farmer-controlled fields';
    END IF;
    -- Buyer allowed status transitions: negotiating->cancelled, arrived->completed, funded->cancelled
    IF NEW.status <> OLD.status AND NOT (
        (OLD.status = 'negotiating' AND NEW.status IN ('funded','cancelled'))
        OR (OLD.status = 'funded' AND NEW.status = 'cancelled')
        OR (OLD.status = 'arrived' AND NEW.status = 'completed')
    ) THEN
      RAISE EXCEPTION 'buyer cannot perform that status transition';
    END IF;
    RETURN NEW;
  END IF;

  IF v_uid = OLD.farmer_id THEN
    -- Farmer may set pricing before funding, drive delivery timestamps, and status transitions on their side
    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.feedback IS DISTINCT FROM OLD.feedback
       OR NEW.destination_label IS DISTINCT FROM OLD.destination_label
       OR NEW.destination_lat IS DISTINCT FROM OLD.destination_lat
       OR NEW.destination_lng IS DISTINCT FROM OLD.destination_lng
       OR NEW.geofence_radius_m <> OLD.geofence_radius_m
       OR NEW.funded_at IS DISTINCT FROM OLD.funded_at
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'farmer cannot modify buyer-controlled fields';
    END IF;
    -- Pricing may only change while still negotiating
    IF OLD.status <> 'negotiating' AND (
         NEW.quantity <> OLD.quantity
      OR NEW.unit_price_minor <> OLD.unit_price_minor
      OR NEW.product_subtotal_minor <> OLD.product_subtotal_minor
      OR NEW.delivery_fee_minor <> OLD.delivery_fee_minor
      OR NEW.platform_fee_minor <> OLD.platform_fee_minor
      OR NEW.total_minor <> OLD.total_minor
      OR NEW.currency <> OLD.currency
    ) THEN
      RAISE EXCEPTION 'farmer cannot change pricing after negotiation';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
        (OLD.status = 'funded' AND NEW.status IN ('in_transit','cancelled'))
        OR (OLD.status = 'in_transit' AND NEW.status IN ('arrived','cancelled'))
    ) THEN
      RAISE EXCEPTION 'farmer cannot perform that status transition';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'not a party to this order';
END;
$$;

DROP TRIGGER IF EXISTS trg_escrow_orders_enforce_update ON public.escrow_orders;
CREATE TRIGGER trg_escrow_orders_enforce_update
BEFORE UPDATE ON public.escrow_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_escrow_order_update();

-- 3) Farmers: hide phone_e164 from other users via column privilege
REVOKE SELECT (phone_e164) ON public.farmers FROM authenticated, anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.get_my_farmer_phone()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT phone_e164 FROM public.farmers WHERE id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_farmer_phone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_farmer_phone() TO authenticated;

-- 4) order_otps: hide code_hash and sent_to_phone from clients
REVOKE SELECT (code_hash, sent_to_phone) ON public.order_otps FROM authenticated, anon, PUBLIC;
