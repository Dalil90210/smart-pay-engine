
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- enums
CREATE TYPE public.currency_code AS ENUM ('USD','EUR','GBP');
CREATE TYPE public.account_type AS ENUM ('checking','funding','fx_suspense');
CREATE TYPE public.tx_type AS ENUM ('deposit','withdrawal','transfer','fx');
CREATE TYPE public.tx_state AS ENUM ('initiated','confirmed','completed','failed');
CREATE TYPE public.entry_direction AS ENUM ('debit','credit');

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  pin_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency public.currency_code NOT NULL,
  type public.account_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency, type)
);

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  type public.tx_type NOT NULL,
  state public.tx_state NOT NULL DEFAULT 'initiated',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  direction public.entry_direction NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency public.currency_code NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_account_idx ON public.ledger_entries(account_id);
CREATE INDEX ledger_entries_tx_idx ON public.ledger_entries(transaction_id);

CREATE TABLE public.payees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_ref TEXT NOT NULL,
  currency public.currency_code NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.accounts TO authenticated;
GRANT SELECT ON public.transactions TO authenticated;
GRANT SELECT ON public.ledger_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payees TO authenticated;
GRANT ALL ON public.profiles, public.accounts, public.transactions, public.ledger_entries, public.payees TO service_role;

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "own accounts" ON public.accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own ledger" ON public.ledger_entries FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = ledger_entries.account_id AND a.user_id = auth.uid())
);
CREATE POLICY "own payees" ON public.payees FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Balances view
CREATE OR REPLACE VIEW public.account_balances
WITH (security_invoker = true)
AS
SELECT
  a.id AS account_id,
  a.user_id,
  a.currency,
  a.type,
  COALESCE(SUM(CASE WHEN le.direction = 'credit' THEN le.amount_minor ELSE -le.amount_minor END), 0)::BIGINT AS balance_minor
FROM public.accounts a
LEFT JOIN public.ledger_entries le ON le.account_id = a.id
GROUP BY a.id;

GRANT SELECT ON public.account_balances TO authenticated;

-- post_transaction RPC
CREATE OR REPLACE FUNCTION public.post_transaction(
  p_idempotency_key TEXT,
  p_type public.tx_type,
  p_metadata JSONB,
  p_entries JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_currencies TEXT[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Idempotency
  SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
  IF v_tx_id IS NOT NULL THEN
    RETURN v_tx_id;
  END IF;

  IF jsonb_array_length(p_entries) < 2 THEN
    RAISE EXCEPTION 'must have at least 2 entries';
  END IF;

  -- Validate accounts belong to user and currencies match and compute sums
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

  -- Balanced per currency
  FOR v_ccy IN SELECT jsonb_object_keys(v_sums) LOOP
    IF (v_sums->>v_ccy)::bigint <> 0 THEN
      RAISE EXCEPTION 'unbalanced ledger entries for %', v_ccy;
    END IF;
  END LOOP;

  -- Create transaction
  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (v_user, p_idempotency_key, p_type, 'completed', COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_tx_id;

  -- Insert entries
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
$$;

GRANT EXECUTE ON FUNCTION public.post_transaction(TEXT, public.tx_type, JSONB, JSONB) TO authenticated;

-- PIN functions
CREATE OR REPLACE FUNCTION public.set_pin(p_pin TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'pin must be 4 digits'; END IF;
  UPDATE public.profiles SET pin_hash = crypt(p_pin, gen_salt('bf')) WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_pin(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_pin(p_pin TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hash TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT pin_hash INTO v_hash FROM public.profiles WHERE id = auth.uid();
  IF v_hash IS NULL THEN RETURN FALSE; END IF;
  RETURN v_hash = crypt(p_pin, v_hash);
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_pin(TEXT) TO authenticated;

-- new user trigger: profile + 4 accounts (3 checking + funding) + payees + seed deposits
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_funding_usd UUID; v_funding_eur UUID; v_funding_gbp UUID;
  v_chk_usd UUID; v_chk_eur UUID; v_chk_gbp UUID;
  v_tx UUID;
BEGIN
  INSERT INTO public.profiles(id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));

  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'USD','checking') RETURNING id INTO v_chk_usd;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'EUR','checking') RETURNING id INTO v_chk_eur;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'GBP','checking') RETURNING id INTO v_chk_gbp;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'USD','funding') RETURNING id INTO v_funding_usd;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'EUR','funding') RETURNING id INTO v_funding_eur;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'GBP','funding') RETURNING id INTO v_funding_gbp;
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'USD','fx_suspense');
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'EUR','fx_suspense');
  INSERT INTO public.accounts(user_id, currency, type) VALUES (NEW.id, 'GBP','fx_suspense');

  -- Seed deposit transaction (balanced: debit funding, credit checking)
  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed:' || NEW.id::text, 'deposit', 'completed', jsonb_build_object('seed', true))
  RETURNING id INTO v_tx;

  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_funding_usd, 'debit',  250000, 'USD'),
    (v_tx, v_chk_usd,     'credit', 250000, 'USD'),
    (v_tx, v_funding_eur, 'debit',  180000, 'EUR'),
    (v_tx, v_chk_eur,     'credit', 180000, 'EUR'),
    (v_tx, v_funding_gbp, 'debit',  120000, 'GBP'),
    (v_tx, v_chk_gbp,     'credit', 120000, 'GBP');

  -- Seed payees
  INSERT INTO public.payees(user_id, name, account_ref, currency) VALUES
    (NEW.id, 'Maria López',  'ES91 2100 0418 4502 0005 1332', 'EUR'),
    (NEW.id, 'James Carter', 'GB29 NWBK 6016 1331 9268 19',   'GBP'),
    (NEW.id, 'Acme Inc',     '021000021 / 1234567890',         'USD'),
    (NEW.id, 'Sofia Rossi',  'IT60 X054 2811 1010 0000 0123 456','EUR');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
