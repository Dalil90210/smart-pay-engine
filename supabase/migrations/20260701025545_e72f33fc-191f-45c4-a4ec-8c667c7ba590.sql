
-- Backfill fee_revenue accounts for existing users
INSERT INTO public.accounts(user_id, currency, type)
SELECT p.id, c.ccy::public.currency_code, 'fee_revenue'::public.account_type
  FROM public.profiles p
  CROSS JOIN (VALUES ('USD'),('EUR'),('GBP')) AS c(ccy)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.accounts a
    WHERE a.user_id = p.id AND a.currency = c.ccy::public.currency_code AND a.type = 'fee_revenue'
 );

-- Update handle_new_user to also seed a fee_revenue wallet per currency
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_funding_usd UUID; v_funding_eur UUID; v_funding_gbp UUID;
  v_chk_usd UUID; v_chk_eur UUID; v_chk_gbp UUID;
  v_fx_usd UUID; v_fx_eur UUID; v_fx_gbp UUID;
  v_tx UUID;
BEGIN
  INSERT INTO public.profiles(id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));

  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'USD','checking') RETURNING id INTO v_chk_usd;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'EUR','checking') RETURNING id INTO v_chk_eur;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'GBP','checking') RETURNING id INTO v_chk_gbp;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'USD','funding') RETURNING id INTO v_funding_usd;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'EUR','funding') RETURNING id INTO v_funding_eur;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'GBP','funding') RETURNING id INTO v_funding_gbp;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'USD','fx_suspense') RETURNING id INTO v_fx_usd;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'EUR','fx_suspense') RETURNING id INTO v_fx_eur;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'GBP','fx_suspense') RETURNING id INTO v_fx_gbp;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'USD','tax_setaside');
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'EUR','tax_setaside');
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'GBP','tax_setaside');
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'USD','fee_revenue');
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'EUR','fee_revenue');
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'GBP','fee_revenue');

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed:'||NEW.id::text, 'deposit', 'completed', jsonb_build_object('seed',true,'note','Initial sandbox balance'))
  RETURNING id INTO v_tx;
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_funding_usd, 'debit',  850000, 'USD'), (v_tx, v_chk_usd, 'credit', 850000, 'USD'),
    (v_tx, v_funding_eur, 'debit',  620000, 'EUR'), (v_tx, v_chk_eur, 'credit', 620000, 'EUR'),
    (v_tx, v_funding_gbp, 'debit',  410000, 'GBP'), (v_tx, v_chk_gbp, 'credit', 410000, 'GBP');

  INSERT INTO public.payees(user_id, name, account_ref, currency) VALUES
    (NEW.id, 'Maria López',  'ES91 2100 0418 4502 0005 1332', 'EUR'),
    (NEW.id, 'James Carter', 'GB29 NWBK 6016 1331 9268 19',   'GBP'),
    (NEW.id, 'Acme Inc',     '021000021 / 1234567890',         'USD');

  RETURN NEW;
END;
$function$;

-- Server-side FX conversion RPC: computes mid rate + spread, books balanced ledger
-- Entries per conversion:
--   1) debit  checking(from)      X   from_ccy
--   2) credit fx_suspense(from)   X   from_ccy   → balances from_ccy
--   3) debit  fx_suspense(to)     G   to_ccy     (G = ROUND(X * mid))
--   4) credit checking(to)        N   to_ccy     (N = ROUND(X * mid * (1 - spread)))
--   5) credit fee_revenue(to)     G-N to_ccy     → balances to_ccy
CREATE OR REPLACE FUNCTION public.post_fx_conversion(
  p_idempotency_key text,
  p_from_currency public.currency_code,
  p_to_currency   public.currency_code,
  p_from_amount_minor bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_mid  NUMERIC;
  v_spread NUMERIC := 0.005;
  v_gross BIGINT;
  v_net   BIGINT;
  v_fee   BIGINT;
  v_chk_from UUID; v_chk_to UUID;
  v_fx_from  UUID; v_fx_to  UUID;
  v_fee_to   UUID;
  v_existing UUID;
  v_tx UUID;
  v_entries jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_from_currency = p_to_currency THEN RAISE EXCEPTION 'currencies must differ'; END IF;
  IF p_from_amount_minor <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  -- Idempotency short-circuit — never re-execute the same key
  SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('transaction_id', v_existing, 'reused', true);
  END IF;

  -- Server-authoritative mid-market rate table (sandbox)
  v_mid := CASE p_from_currency::text || '->' || p_to_currency::text
             WHEN 'USD->EUR' THEN 0.92
             WHEN 'EUR->USD' THEN 1.087
             WHEN 'USD->GBP' THEN 0.79
             WHEN 'GBP->USD' THEN 1.265
             WHEN 'EUR->GBP' THEN 0.86
             WHEN 'GBP->EUR' THEN 1.163
           END;
  IF v_mid IS NULL THEN RAISE EXCEPTION 'unsupported currency pair'; END IF;

  v_gross := ROUND(p_from_amount_minor * v_mid)::bigint;
  v_net   := ROUND(p_from_amount_minor * v_mid * (1 - v_spread))::bigint;
  v_fee   := v_gross - v_net;
  IF v_fee < 0 THEN v_fee := 0; END IF;

  SELECT id INTO v_chk_from FROM public.accounts WHERE user_id = v_user AND currency = p_from_currency AND type = 'checking';
  SELECT id INTO v_chk_to   FROM public.accounts WHERE user_id = v_user AND currency = p_to_currency   AND type = 'checking';
  SELECT id INTO v_fx_from  FROM public.accounts WHERE user_id = v_user AND currency = p_from_currency AND type = 'fx_suspense';
  SELECT id INTO v_fx_to    FROM public.accounts WHERE user_id = v_user AND currency = p_to_currency   AND type = 'fx_suspense';
  SELECT id INTO v_fee_to   FROM public.accounts WHERE user_id = v_user AND currency = p_to_currency   AND type = 'fee_revenue';
  IF v_chk_from IS NULL OR v_chk_to IS NULL OR v_fx_from IS NULL OR v_fx_to IS NULL OR v_fee_to IS NULL THEN
    RAISE EXCEPTION 'wallets not provisioned';
  END IF;

  v_entries := jsonb_build_array(
    jsonb_build_object('account_id', v_chk_from, 'direction', 'debit',  'amount_minor', p_from_amount_minor),
    jsonb_build_object('account_id', v_fx_from,  'direction', 'credit', 'amount_minor', p_from_amount_minor),
    jsonb_build_object('account_id', v_fx_to,    'direction', 'debit',  'amount_minor', v_gross),
    jsonb_build_object('account_id', v_chk_to,   'direction', 'credit', 'amount_minor', v_net)
  );
  IF v_fee > 0 THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object('account_id', v_fee_to, 'direction', 'credit', 'amount_minor', v_fee)
    );
  ELSE
    -- Ensure to_ccy still balances when fee rounds to zero: net absorbs the whole gross
    v_entries := jsonb_build_array(
      jsonb_build_object('account_id', v_chk_from, 'direction', 'debit',  'amount_minor', p_from_amount_minor),
      jsonb_build_object('account_id', v_fx_from,  'direction', 'credit', 'amount_minor', p_from_amount_minor),
      jsonb_build_object('account_id', v_fx_to,    'direction', 'debit',  'amount_minor', v_net),
      jsonb_build_object('account_id', v_chk_to,   'direction', 'credit', 'amount_minor', v_net)
    );
  END IF;

  v_tx := public.post_transaction(
    p_idempotency_key,
    'fx'::public.tx_type,
    jsonb_build_object(
      'description', p_from_currency::text || ' → ' || p_to_currency::text,
      'from_currency', p_from_currency,
      'to_currency', p_to_currency,
      'from_amount_minor', p_from_amount_minor,
      'to_amount_minor', v_net,
      'gross_to_minor', v_gross,
      'fee_minor', v_fee,
      'mid_rate', v_mid,
      'effective_rate', v_mid * (1 - v_spread),
      'spread', v_spread,
      'server_priced', true
    ),
    v_entries
  );

  RETURN jsonb_build_object(
    'transaction_id', v_tx,
    'from_amount_minor', p_from_amount_minor,
    'to_amount_minor', v_net,
    'fee_minor', v_fee,
    'mid_rate', v_mid,
    'effective_rate', v_mid * (1 - v_spread),
    'spread', v_spread,
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_fx_conversion(text, public.currency_code, public.currency_code, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_fx_conversion(text, public.currency_code, public.currency_code, bigint) TO authenticated;
