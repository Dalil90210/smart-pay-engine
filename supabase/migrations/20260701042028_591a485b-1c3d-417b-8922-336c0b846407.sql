
-- Enums
CREATE TYPE public.marketplace_role AS ENUM ('farmer','buyer');
CREATE TYPE public.product_category AS ENUM ('crop','livestock','dairy','poultry','other');
CREATE TYPE public.listing_status AS ENUM ('active','paused','sold','archived');
CREATE TYPE public.order_status AS ENUM (
  'negotiating','awaiting_payment','funded','in_transit','arrived','completed','cancelled','disputed'
);
CREATE TYPE public.payment_method AS ENUM ('card','paypal','bank_transfer');

-- Farmers
CREATE TABLE public.farmers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  farm_name TEXT NOT NULL,
  location_label TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  crops TEXT[] NOT NULL DEFAULT '{}',
  livestock TEXT[] NOT NULL DEFAULT '{}',
  expected_supply TEXT,
  avatar_url TEXT,
  onboarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.farmers TO authenticated;
GRANT ALL ON public.farmers TO service_role;
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Farmers readable by signed-in users" ON public.farmers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Farmer manages own profile insert" ON public.farmers FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Farmer manages own profile update" ON public.farmers FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Farmer deletes own profile" ON public.farmers FOR DELETE TO authenticated USING (id = auth.uid());

-- Buyers
CREATE TABLE public.buyers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  default_address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyers TO authenticated;
GRANT ALL ON public.buyers TO service_role;
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyer reads own profile" ON public.buyers FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Buyer inserts own profile" ON public.buyers FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Buyer updates own profile" ON public.buyers FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Buyer deletes own profile" ON public.buyers FOR DELETE TO authenticated USING (id = auth.uid());

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category public.product_category NOT NULL DEFAULT 'crop',
  unit TEXT NOT NULL DEFAULT 'kg',
  price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  quantity_available NUMERIC(14,3) NOT NULL DEFAULT 0,
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status public.listing_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_farmer_idx ON public.products(farmer_id);
CREATE INDEX products_status_idx ON public.products(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active products browsable" ON public.products FOR SELECT TO authenticated USING (status = 'active' OR farmer_id = auth.uid());
CREATE POLICY "Farmer inserts own product" ON public.products FOR INSERT TO authenticated WITH CHECK (farmer_id = auth.uid());
CREATE POLICY "Farmer updates own product" ON public.products FOR UPDATE TO authenticated USING (farmer_id = auth.uid()) WITH CHECK (farmer_id = auth.uid());
CREATE POLICY "Farmer deletes own product" ON public.products FOR DELETE TO authenticated USING (farmer_id = auth.uid());

-- Chats
CREATE TABLE public.marketplace_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, buyer_id)
);
CREATE INDEX mchats_buyer_idx ON public.marketplace_chats(buyer_id);
CREATE INDEX mchats_farmer_idx ON public.marketplace_chats(farmer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_chats TO authenticated;
GRANT ALL ON public.marketplace_chats TO service_role;
ALTER TABLE public.marketplace_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chat participants read" ON public.marketplace_chats FOR SELECT TO authenticated USING (buyer_id = auth.uid() OR farmer_id = auth.uid());
CREATE POLICY "Buyer starts chat" ON public.marketplace_chats FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "Participants update chat" ON public.marketplace_chats FOR UPDATE TO authenticated USING (buyer_id = auth.uid() OR farmer_id = auth.uid()) WITH CHECK (buyer_id = auth.uid() OR farmer_id = auth.uid());

-- Chat messages
CREATE TABLE public.marketplace_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.marketplace_chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT,
  offer_price_minor BIGINT CHECK (offer_price_minor IS NULL OR offer_price_minor >= 0),
  offer_quantity NUMERIC(14,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mmsgs_chat_idx ON public.marketplace_messages(chat_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_messages TO authenticated;
GRANT ALL ON public.marketplace_messages TO service_role;
ALTER TABLE public.marketplace_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chat members read messages" ON public.marketplace_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.marketplace_chats c WHERE c.id = chat_id AND (c.buyer_id = auth.uid() OR c.farmer_id = auth.uid()))
);
CREATE POLICY "Chat members send messages" ON public.marketplace_messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.marketplace_chats c WHERE c.id = chat_id AND (c.buyer_id = auth.uid() OR c.farmer_id = auth.uid())
  )
);

-- Escrow orders
CREATE TABLE public.escrow_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES public.marketplace_chats(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
  product_subtotal_minor BIGINT NOT NULL CHECK (product_subtotal_minor >= 0),
  delivery_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0),
  platform_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (platform_fee_minor >= 0),
  total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method public.payment_method,
  status public.order_status NOT NULL DEFAULT 'negotiating',
  destination_label TEXT,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  geofence_radius_m INT NOT NULL DEFAULT 150,
  funded_at TIMESTAMPTZ,
  in_transit_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_buyer_idx ON public.escrow_orders(buyer_id);
CREATE INDEX orders_farmer_idx ON public.escrow_orders(farmer_id);
CREATE INDEX orders_status_idx ON public.escrow_orders(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escrow_orders TO authenticated;
GRANT ALL ON public.escrow_orders TO service_role;
ALTER TABLE public.escrow_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Order parties read" ON public.escrow_orders FOR SELECT TO authenticated USING (buyer_id = auth.uid() OR farmer_id = auth.uid());
CREATE POLICY "Buyer creates order" ON public.escrow_orders FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "Order parties update" ON public.escrow_orders FOR UPDATE TO authenticated USING (buyer_id = auth.uid() OR farmer_id = auth.uid()) WITH CHECK (buyer_id = auth.uid() OR farmer_id = auth.uid());

-- OTP for release of funds
CREATE TABLE public.order_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.escrow_orders(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  sent_to_phone TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0
);
CREATE INDEX order_otps_order_idx ON public.order_otps(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_otps TO authenticated;
GRANT ALL ON public.order_otps TO service_role;
ALTER TABLE public.order_otps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyer reads own OTP metadata" ON public.order_otps FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.escrow_orders o WHERE o.id = order_id AND o.buyer_id = auth.uid())
);

-- Delivery tracking points
CREATE TABLE public.delivery_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.escrow_orders(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  distance_to_dest_m INT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tracking_order_idx ON public.delivery_tracking(order_id, recorded_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_tracking TO authenticated;
GRANT ALL ON public.delivery_tracking TO service_role;
ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Order parties read tracking" ON public.delivery_tracking FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.escrow_orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.farmer_id = auth.uid()))
);
CREATE POLICY "Farmer writes tracking" ON public.delivery_tracking FOR INSERT TO authenticated WITH CHECK (
  farmer_id = auth.uid() AND EXISTS (SELECT 1 FROM public.escrow_orders o WHERE o.id = order_id AND o.farmer_id = auth.uid())
);

-- updated_at triggers
CREATE TRIGGER trg_farmers_touch BEFORE UPDATE ON public.farmers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_buyers_touch BEFORE UPDATE ON public.buyers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_products_touch BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_mchats_touch BEFORE UPDATE ON public.marketplace_chats FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_orders_touch BEFORE UPDATE ON public.escrow_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
