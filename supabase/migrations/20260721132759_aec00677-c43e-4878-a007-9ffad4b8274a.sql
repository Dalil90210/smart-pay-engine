CREATE OR REPLACE FUNCTION public.provision_user_wallets(p_user_id uuid, p_email text DEFAULT NULL, p_display_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_funding_usd UUID; v_funding_eur UUID; v_funding_gbp UUID;
  v_chk_usd UUID; v_chk_eur UUID; v_chk_gbp UUID;
  v_fx_usd UUID; v_fx_eur UUID; v_fx_gbp UUID;
  v_tx UUID;
  v_name TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_name := COALESCE(NULLIF(trim(p_display_name), ''), NULLIF(split_part(COALESCE(p_email, ''), '@', 1), ''), 'Smart Pay Engine user');

  INSERT INTO public.profiles(id, display_name)
  VALUES (p_user_id, v_name)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.accounts(user_id, currency, type) VALUES (p_user_id, 'USD','checking')
  ON CONFLICT (user_id, currency, type) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id INTO v_chk_usd;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (p_user_id, 'EUR','checking')
  ON CONFLICT (user_id, currency, type) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id INTO v_chk_eur;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (p_user_id, 'GBP','checking')
  ON CONFLICT (user_id, currency, type) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id INTO v_chk_gbp;

  INSERT INTO public.accounts(user_id, currency, type) VALUES (p_user_id, 'USD','funding')
  ON CONFLICT (user_id, currency, type) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id INTO v_funding_usd;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (p_user_id, 'EUR','funding')
  ON CONFLICT (user_id, currency, type) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id INTO v_funding_eur;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (p_user_id, 'GBP','funding')
  ON CONFLICT (user_id, currency, type) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id INTO v_funding_gbp;

  INSERT INTO public.accounts(user_id, currency, type) VALUES (p_user_id, 'USD','fx_suspense')
  ON CONFLICT (user_id, currency, type) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id INTO v_fx_usd;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (p_user_id, 'EUR','fx_suspense')
  ON CONFLICT (user_id, currency, type) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id INTO v_fx_eur;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (p_user_id, 'GBP','fx_suspense')
  ON CONFLICT (user_id, currency, type) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id INTO v_fx_gbp;

  INSERT INTO public.accounts(user_id, currency, type) VALUES
    (p_user_id, 'USD','tax_setaside'), (p_user_id, 'EUR','tax_setaside'), (p_user_id, 'GBP','tax_setaside'),
    (p_user_id, 'USD','fee_revenue'), (p_user_id, 'EUR','fee_revenue'), (p_user_id, 'GBP','fee_revenue')
  ON CONFLICT (user_id, currency, type) DO NOTHING;

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (p_user_id, 'seed:'||p_user_id::text, 'deposit', 'completed', jsonb_build_object('seed',true,'note','Initial sandbox balance'))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_tx;

  IF v_tx IS NOT NULL THEN
    INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
      (v_tx, v_funding_usd, 'debit',  850000, 'USD'), (v_tx, v_chk_usd, 'credit', 850000, 'USD'),
      (v_tx, v_funding_eur, 'debit',  620000, 'EUR'), (v_tx, v_chk_eur, 'credit', 620000, 'EUR'),
      (v_tx, v_funding_gbp, 'debit',  410000, 'GBP'), (v_tx, v_chk_gbp, 'credit', 410000, 'GBP');
  END IF;

  INSERT INTO public.payees(user_id, name, account_ref, currency) VALUES
    (p_user_id, 'Maria López',  'ES91 2100 0418 4502 0005 1332', 'EUR'),
    (p_user_id, 'James Carter', 'GB29 NWBK 6016 1331 9268 19',   'GBP'),
    (p_user_id, 'Acme Inc',     '021000021 / 1234567890',         'USD')
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.provision_user_wallets(
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1))
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();