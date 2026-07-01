
CREATE OR REPLACE FUNCTION public.post_transaction(p_idempotency_key text, p_type tx_type, p_metadata jsonb, p_entries jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Idempotency: same key returns the prior transaction id, never re-executes.
  SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
  IF v_tx_id IS NOT NULL THEN
    RETURN v_tx_id;
  END IF;

  IF jsonb_array_length(p_entries) < 2 THEN
    RAISE EXCEPTION 'must have at least 2 entries';
  END IF;

  -- Collect debited account ids up front and lock them in a stable order to
  -- prevent deadlocks and eliminate TOCTOU between the balance check and the
  -- insert. Two concurrent overdraws will now serialize on these row locks.
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    IF (v_entry->>'direction') = 'debit' THEN
      v_debited_ids := array_append(v_debited_ids, (v_entry->>'account_id')::uuid);
    END IF;
  END LOOP;

  PERFORM 1 FROM public.accounts
   WHERE id = ANY(v_debited_ids)
   ORDER BY id
   FOR UPDATE;

  -- Validate accounts, currencies, amounts, and balance the entries per currency.
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

    v_sums := jsonb_set(
      v_sums,
      ARRAY[v_ccy],
      to_jsonb(
        COALESCE((v_sums->>v_ccy)::bigint, 0) +
        CASE WHEN v_dir = 'credit' THEN v_amt ELSE -v_amt END
      ),
      true
    );
  END LOOP;

  FOR v_ccy IN SELECT jsonb_object_keys(v_sums) LOOP
    IF (v_sums->>v_ccy)::bigint <> 0 THEN
      RAISE EXCEPTION 'unbalanced ledger entries for %', v_ccy;
    END IF;
  END LOOP;

  -- Overdraft check: no debited account may end up with a negative balance.
  -- Uses the derived account_balances view (credits - debits) plus the pending
  -- net effect of this transaction's entries.
  FOREACH v_acc_id IN ARRAY v_debited_ids LOOP
    SELECT COALESCE(b.balance_minor, 0) INTO v_new_balance
      FROM public.account_balances b WHERE b.account_id = v_acc_id;

    SELECT v_new_balance + COALESCE(SUM(
      CASE WHEN (e->>'direction') = 'credit' THEN (e->>'amount_minor')::bigint
           ELSE -((e->>'amount_minor')::bigint) END
    ), 0)
      INTO v_new_balance
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
    VALUES (
      v_tx_id,
      (v_entry->>'account_id')::uuid,
      (v_entry->>'direction')::public.entry_direction,
      (v_entry->>'amount_minor')::bigint,
      v_acc.currency
    );
  END LOOP;

  RETURN v_tx_id;
END;
$function$;
