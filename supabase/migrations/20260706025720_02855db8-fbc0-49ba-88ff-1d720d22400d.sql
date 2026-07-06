ALTER FUNCTION public.set_pin(text) SET search_path = public, extensions;
ALTER FUNCTION public.verify_pin(text) SET search_path = public, extensions;
ALTER FUNCTION public.post_transaction(text, public.tx_type, jsonb, jsonb, text) SET search_path = public, extensions;
ALTER FUNCTION public.post_fx_conversion(text, public.currency_code, public.currency_code, bigint, text) SET search_path = public, extensions;