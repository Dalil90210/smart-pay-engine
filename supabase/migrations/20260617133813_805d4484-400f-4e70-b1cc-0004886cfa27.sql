-- 1) Move pin_hash to a separate table; remove from profiles
CREATE TABLE IF NOT EXISTS public.user_pins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.user_pins TO service_role;
ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;

INSERT INTO public.user_pins(user_id, pin_hash)
SELECT id, pin_hash FROM public.profiles WHERE pin_hash IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS pin_hash;

CREATE OR REPLACE FUNCTION public.set_pin(p_pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'pin must be 4 digits'; END IF;
  INSERT INTO public.user_pins(user_id, pin_hash, updated_at)
  VALUES (auth.uid(), crypt(p_pin, gen_salt('bf')), now())
  ON CONFLICT (user_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.verify_pin(p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hash TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT pin_hash INTO v_hash FROM public.user_pins WHERE user_id = auth.uid();
  IF v_hash IS NULL THEN RETURN FALSE; END IF;
  RETURN v_hash = crypt(p_pin, v_hash);
END; $$;

CREATE OR REPLACE FUNCTION public.has_pin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_pins WHERE user_id = auth.uid());
$$;

-- 2) Restrictive policies blocking direct writes on financial tables; mutations go through post_transaction
CREATE POLICY "deny direct insert" ON public.accounts AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "deny direct update" ON public.accounts AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "deny direct delete" ON public.accounts AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

CREATE POLICY "deny direct insert" ON public.transactions AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "deny direct update" ON public.transactions AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "deny direct delete" ON public.transactions AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

CREATE POLICY "deny direct insert" ON public.ledger_entries AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "deny direct update" ON public.ledger_entries AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "deny direct delete" ON public.ledger_entries AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- 3) Lock down EXECUTE on SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_pin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pin(text) TO authenticated;
REVOKE ALL ON FUNCTION public.verify_pin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_pin(text) TO authenticated;
REVOKE ALL ON FUNCTION public.has_pin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_pin() TO authenticated;
REVOKE ALL ON FUNCTION public.post_transaction(text, public.tx_type, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_transaction(text, public.tx_type, jsonb, jsonb) TO authenticated;