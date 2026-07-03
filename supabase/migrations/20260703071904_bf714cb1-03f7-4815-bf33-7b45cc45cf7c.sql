
-- 1. Replace post_transaction with a PIN-verifying version
DROP FUNCTION IF EXISTS public.post_transaction(text, public.tx_type, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.post_transaction(
  p_idempotency_key text,
  p_type public.tx_type,
  p_metadata jsonb,
  p_entries jsonb,
  p_pin text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_tx_id UUID;
  v_entry JSONB;
  v_acc public.accounts%ROWTYPE;
  v_sums JSONB := '{}'::jsonb;
  v_ccy TEXT;
  v_amt BIGINT;
  v_dir TEXT;
  v_debited_ids UUID[] := ARRAY[]::UUID[];
  v_acc_id UUID;
  v_new_balance BIGINT;
  v_pin_hash TEXT;
  v_internal BOOLEAN := (current_setting('spe.internal', true) = 'yes');
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Server-enforced PIN gate: any user with a PIN set must supply it on every
  -- money-moving call. Internal server-authoritative callers (post_fx_conversion,
  -- pay_invoice_by_token) set the `spe.internal` GUC to bypass this after doing
  -- their own authorization.
  IF NOT v_internal THEN
    SELECT pin_hash INTO v_pin_hash FROM public.user_pins WHERE user_id = v_user;
    IF v_pin_hash IS NOT NULL THEN
      IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' OR v_pin_hash <> crypt(p_pin, v_pin_hash) THEN
        RAISE EXCEPTION 'invalid pin' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
  IF v_tx_id IS NOT NULL THEN
    RETURN v_tx_id;
  END IF;

  IF jsonb_array_length(p_entries) < 2 THEN
    RAISE EXCEPTION 'must have at least 2 entries';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    IF (v_entry->>'direction') = 'debit' THEN
      v_debited_ids := array_append(v_debited_ids, (v_entry->>'account_id')::uuid);
    END IF;
  END LOOP;

  PERFORM 1 FROM public.accounts WHERE id = ANY(v_debited_ids) ORDER BY id FOR UPDATE;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    SELECT * INTO v_acc FROM public.accounts WHERE id = (v_entry->>'account_id')::uuid;
    IF NOT FOUND OR v_acc.user_id <> v_user THEN
      RAISE EXCEPTION 'invalid account';
    END IF;
    v_ccy := v_acc.currency::text;
    v_amt := (v_entry->>'amount_minor')::bigint;
    v_dir := v_entry->>'direction';
    IF v_amt <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
    IF v_dir NOT IN ('debit','credit') THEN RAISE EXCEPTION 'bad direction'; END IF;
    v_sums := jsonb_set(v_sums, ARRAY[v_ccy], to_jsonb(
      COALESCE((v_sums->>v_ccy)::bigint, 0) + CASE WHEN v_dir='credit' THEN v_amt ELSE -v_amt END
    ), true);
  END LOOP;

  FOR v_ccy IN SELECT jsonb_object_keys(v_sums) LOOP
    IF (v_sums->>v_ccy)::bigint <> 0 THEN
      RAISE EXCEPTION 'unbalanced ledger entries for %', v_ccy;
    END IF;
  END LOOP;

  FOREACH v_acc_id IN ARRAY v_debited_ids LOOP
    SELECT COALESCE(b.balance_minor, 0) INTO v_new_balance
      FROM public.account_balances b WHERE b.account_id = v_acc_id;
    SELECT v_new_balance + COALESCE(SUM(
      CASE WHEN (e->>'direction') = 'credit' THEN (e->>'amount_minor')::bigint
           ELSE -((e->>'amount_minor')::bigint) END
    ), 0) INTO v_new_balance
      FROM jsonb_array_elements(p_entries) e
     WHERE (e->>'account_id')::uuid = v_acc_id;
    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (v_user, p_idempotency_key, p_type, 'completed', COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_tx_id;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    SELECT * INTO v_acc FROM public.accounts WHERE id = (v_entry->>'account_id')::uuid;
    INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency)
    VALUES (v_tx_id, (v_entry->>'account_id')::uuid,
      (v_entry->>'direction')::public.entry_direction,
      (v_entry->>'amount_minor')::bigint, v_acc.currency);
  END LOOP;

  RETURN v_tx_id;
END; $$;

-- 2. Replace post_fx_conversion to accept and enforce PIN, then invoke
--    post_transaction with the internal-bypass GUC.
DROP FUNCTION IF EXISTS public.post_fx_conversion(text, public.currency_code, public.currency_code, bigint);

CREATE OR REPLACE FUNCTION public.post_fx_conversion(
  p_idempotency_key text,
  p_from_currency public.currency_code,
  p_to_currency public.currency_code,
  p_from_amount_minor bigint,
  p_pin text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_mid  NUMERIC;
  v_spread NUMERIC := 0.005;
  v_gross BIGINT; v_net BIGINT; v_fee BIGINT;
  v_chk_from UUID; v_chk_to UUID; v_fx_from UUID; v_fx_to UUID; v_fee_to UUID;
  v_existing UUID; v_tx UUID; v_entries jsonb;
  v_pin_hash TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_from_currency = p_to_currency THEN RAISE EXCEPTION 'currencies must differ'; END IF;
  IF p_from_amount_minor <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  -- Server-enforced PIN
  SELECT pin_hash INTO v_pin_hash FROM public.user_pins WHERE user_id = v_user;
  IF v_pin_hash IS NOT NULL THEN
    IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' OR v_pin_hash <> crypt(p_pin, v_pin_hash) THEN
      RAISE EXCEPTION 'invalid pin' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('transaction_id', v_existing, 'reused', true);
  END IF;

  v_mid := CASE p_from_currency::text || '->' || p_to_currency::text
             WHEN 'USD->EUR' THEN 0.92 WHEN 'EUR->USD' THEN 1.087
             WHEN 'USD->GBP' THEN 0.79 WHEN 'GBP->USD' THEN 1.265
             WHEN 'EUR->GBP' THEN 0.86 WHEN 'GBP->EUR' THEN 1.163 END;
  IF v_mid IS NULL THEN RAISE EXCEPTION 'unsupported currency pair'; END IF;

  v_gross := ROUND(p_from_amount_minor * v_mid)::bigint;
  v_net   := ROUND(p_from_amount_minor * v_mid * (1 - v_spread))::bigint;
  v_fee   := v_gross - v_net;
  IF v_fee < 0 THEN v_fee := 0; END IF;

  SELECT id INTO v_chk_from FROM public.accounts WHERE user_id=v_user AND currency=p_from_currency AND type='checking';
  SELECT id INTO v_chk_to   FROM public.accounts WHERE user_id=v_user AND currency=p_to_currency   AND type='checking';
  SELECT id INTO v_fx_from  FROM public.accounts WHERE user_id=v_user AND currency=p_from_currency AND type='fx_suspense';
  SELECT id INTO v_fx_to    FROM public.accounts WHERE user_id=v_user AND currency=p_to_currency   AND type='fx_suspense';
  SELECT id INTO v_fee_to   FROM public.accounts WHERE user_id=v_user AND currency=p_to_currency   AND type='fee_revenue';
  IF v_chk_from IS NULL OR v_chk_to IS NULL OR v_fx_from IS NULL OR v_fx_to IS NULL OR v_fee_to IS NULL THEN
    RAISE EXCEPTION 'wallets not provisioned';
  END IF;

  IF v_fee > 0 THEN
    v_entries := jsonb_build_array(
      jsonb_build_object('account_id', v_chk_from, 'direction','debit',  'amount_minor', p_from_amount_minor),
      jsonb_build_object('account_id', v_fx_from,  'direction','credit', 'amount_minor', p_from_amount_minor),
      jsonb_build_object('account_id', v_fx_to,    'direction','debit',  'amount_minor', v_gross),
      jsonb_build_object('account_id', v_chk_to,   'direction','credit', 'amount_minor', v_net),
      jsonb_build_object('account_id', v_fee_to,   'direction','credit', 'amount_minor', v_fee)
    );
  ELSE
    v_entries := jsonb_build_array(
      jsonb_build_object('account_id', v_chk_from, 'direction','debit',  'amount_minor', p_from_amount_minor),
      jsonb_build_object('account_id', v_fx_from,  'direction','credit', 'amount_minor', p_from_amount_minor),
      jsonb_build_object('account_id', v_fx_to,    'direction','debit',  'amount_minor', v_net),
      jsonb_build_object('account_id', v_chk_to,   'direction','credit', 'amount_minor', v_net)
    );
  END IF;

  PERFORM set_config('spe.internal', 'yes', true);
  v_tx := public.post_transaction(
    p_idempotency_key,
    'fx'::public.tx_type,
    jsonb_build_object(
      'description', p_from_currency::text || ' → ' || p_to_currency::text,
      'from_currency', p_from_currency, 'to_currency', p_to_currency,
      'from_amount_minor', p_from_amount_minor, 'to_amount_minor', v_net,
      'gross_to_minor', v_gross, 'fee_minor', v_fee,
      'mid_rate', v_mid, 'effective_rate', v_mid*(1-v_spread), 'spread', v_spread,
      'server_priced', true
    ),
    v_entries
  );
  PERFORM set_config('spe.internal', 'no', true);

  RETURN jsonb_build_object(
    'transaction_id', v_tx,
    'from_amount_minor', p_from_amount_minor,
    'to_amount_minor', v_net,
    'fee_minor', v_fee,
    'mid_rate', v_mid,
    'effective_rate', v_mid*(1-v_spread),
    'spread', v_spread,
    'reused', false
  );
END; $$;

-- 3. Update pay_invoice_by_token to set the internal GUC (it doesn't call
--    post_transaction, but keeps the pattern consistent for future changes).
--    Already does direct inserts, so no changes needed for correctness.

-- 4. Lock down SECURITY DEFINER function EXECUTE grants.
-- Revoke default PUBLIC/anon execute on every user-callable definer function
-- and grant only where needed.

REVOKE EXECUTE ON FUNCTION public.post_transaction(text, public.tx_type, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.post_transaction(text, public.tx_type, jsonb, jsonb, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.post_fx_conversion(text, public.currency_code, public.currency_code, bigint, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.post_fx_conversion(text, public.currency_code, public.currency_code, bigint, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_pin(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_pin(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.verify_pin(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.verify_pin(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_pin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_pin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_invoice(text, text, public.currency_code, date, jsonb, numeric, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_invoice(text, text, public.currency_code, date, jsonb, numeric, text, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.send_invoice(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.send_invoice(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.send_invoice_reminder(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.send_invoice_reminder(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_farmer_phone() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_farmer_phone() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_order_otp_status(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_order_otp_status(uuid) TO authenticated;

-- Invoice public endpoints intentionally allow anon reads/pays via share token
REVOKE EXECUTE ON FUNCTION public.get_invoice_by_token(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_invoice_by_token(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.pay_invoice_by_token(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pay_invoice_by_token(text, text) TO anon, authenticated;

-- Trigger-only functions must not be callable directly
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_escrow_order_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_marketplace_chat_update() FROM PUBLIC, anon, authenticated;
