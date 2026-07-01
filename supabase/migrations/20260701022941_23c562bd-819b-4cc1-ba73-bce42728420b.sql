
-- 1. Profile setting: tax set-aside percent
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tax_setaside_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (tax_setaside_percent >= 0 AND tax_setaside_percent <= 100);

-- 2. Backfill tax_setaside accounts for existing users
INSERT INTO public.accounts (user_id, currency, type)
SELECT p.id, c.currency, 'tax_setaside'::public.account_type
FROM public.profiles p
CROSS JOIN (VALUES ('USD'::public.currency_code), ('EUR'::public.currency_code), ('GBP'::public.currency_code)) AS c(currency)
ON CONFLICT (user_id, currency, type) DO NOTHING;

-- 3. Update handle_new_user to also create tax_setaside accounts going forward
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

-- 4. Invoices tables
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  currency public.currency_code NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','void')),
  subtotal_minor BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  tax_setaside_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_setaside_percent >= 0 AND tax_setaside_percent <= 100),
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'base64'),
  notes TEXT,
  paid_at TIMESTAMPTZ,
  paid_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, number)
);

CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_user ON public.invoices(user_id, created_at DESC);
CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT ON public.invoices TO anon;
GRANT ALL ON public.invoices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT SELECT ON public.invoice_items TO anon;
GRANT ALL ON public.invoice_items TO service_role;

-- RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own invoices select" ON public.invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own invoices insert" ON public.invoices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own invoices update" ON public.invoices FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own invoices delete" ON public.invoices FOR DELETE USING (auth.uid() = user_id AND status = 'draft');

CREATE POLICY "own invoice items select" ON public.invoice_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid()));
CREATE POLICY "own invoice items write" ON public.invoice_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid()));

-- updated_at trigger
CREATE TRIGGER trg_invoices_touch BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Public read RPC (returns limited fields for the share page)
CREATE OR REPLACE FUNCTION public.get_invoice_by_token(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_biller TEXT;
  v_items jsonb;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE share_token = p_token;
  IF NOT FOUND OR v_inv.status = 'draft' THEN
    RETURN NULL;
  END IF;
  SELECT display_name INTO v_biller FROM public.profiles WHERE id = v_inv.user_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'description', description,
    'quantity', quantity,
    'unit_price_minor', unit_price_minor
  ) ORDER BY position, created_at), '[]'::jsonb) INTO v_items
  FROM public.invoice_items WHERE invoice_id = v_inv.id;
  RETURN jsonb_build_object(
    'id', v_inv.id,
    'number', v_inv.number,
    'client_name', v_inv.client_name,
    'client_email', v_inv.client_email,
    'currency', v_inv.currency,
    'due_date', v_inv.due_date,
    'status', v_inv.status,
    'subtotal_minor', v_inv.subtotal_minor,
    'notes', v_inv.notes,
    'biller_name', COALESCE(v_biller, 'Smart Pay Engine user'),
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_by_token(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.get_invoice_by_token(TEXT) TO anon, authenticated;

-- 6. Create invoice RPC (owner)
CREATE OR REPLACE FUNCTION public.create_invoice(
  p_client_name TEXT,
  p_client_email TEXT,
  p_currency public.currency_code,
  p_due_date DATE,
  p_items jsonb,
  p_tax_setaside_percent NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_send BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_id UUID;
  v_number TEXT;
  v_seq INT;
  v_subtotal BIGINT := 0;
  v_item jsonb;
  v_pct NUMERIC(5,2);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_client_name IS NULL OR length(trim(p_client_name)) = 0 THEN RAISE EXCEPTION 'client_name required'; END IF;
  IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'at least one item required'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'unit_price_minor')::bigint < 0 THEN RAISE EXCEPTION 'negative price'; END IF;
    v_subtotal := v_subtotal + ROUND(((v_item->>'quantity')::numeric) * ((v_item->>'unit_price_minor')::bigint))::bigint;
  END LOOP;

  IF p_tax_setaside_percent IS NULL THEN
    SELECT tax_setaside_percent INTO v_pct FROM public.profiles WHERE id = v_user;
  ELSE
    v_pct := p_tax_setaside_percent;
  END IF;
  IF v_pct IS NULL THEN v_pct := 0; END IF;

  SELECT COUNT(*) + 2047 INTO v_seq FROM public.invoices WHERE user_id = v_user;
  v_number := 'INV-' || v_seq::text;

  INSERT INTO public.invoices(user_id, number, client_name, client_email, currency, due_date,
    status, subtotal_minor, tax_setaside_percent, notes)
  VALUES (v_user, v_number, p_client_name, NULLIF(p_client_email,''), p_currency, p_due_date,
    CASE WHEN p_send THEN 'sent' ELSE 'draft' END, v_subtotal, v_pct, p_notes)
  RETURNING id INTO v_id;

  INSERT INTO public.invoice_items(invoice_id, description, quantity, unit_price_minor, position)
  SELECT v_id,
         (elem->>'description'),
         (elem->>'quantity')::numeric,
         (elem->>'unit_price_minor')::bigint,
         (row_number() OVER () - 1)::int
  FROM jsonb_array_elements(p_items) elem;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice(TEXT,TEXT,public.currency_code,DATE,jsonb,NUMERIC,TEXT,BOOLEAN) FROM public;
GRANT EXECUTE ON FUNCTION public.create_invoice(TEXT,TEXT,public.currency_code,DATE,jsonb,NUMERIC,TEXT,BOOLEAN) TO authenticated;

-- 7. Mark an invoice as sent (owner)
CREATE OR REPLACE FUNCTION public.send_invoice(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.invoices
     SET status = 'sent'
   WHERE id = p_invoice_id AND user_id = auth.uid() AND status = 'draft';
END;
$$;

REVOKE ALL ON FUNCTION public.send_invoice(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.send_invoice(UUID) TO authenticated;

-- 8. Pay invoice by share token (public, sandbox)
CREATE OR REPLACE FUNCTION public.pay_invoice_by_token(p_token TEXT, p_idempotency_key TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_tx UUID;
  v_existing UUID;
  v_funding UUID;
  v_checking UUID;
  v_tax_acc UUID;
  v_setaside BIGINT;
  v_to_checking BIGINT;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE share_token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF v_inv.status = 'paid' THEN
    RETURN jsonb_build_object('status','paid','transaction_id', v_inv.paid_transaction_id, 'invoice_id', v_inv.id);
  END IF;
  IF v_inv.status = 'draft' THEN RAISE EXCEPTION 'invoice not sent yet'; END IF;

  -- Idempotency short-circuit
  SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status','paid','transaction_id', v_existing, 'invoice_id', v_inv.id);
  END IF;

  SELECT id INTO v_funding FROM public.accounts WHERE user_id = v_inv.user_id AND currency = v_inv.currency AND type = 'funding';
  SELECT id INTO v_checking FROM public.accounts WHERE user_id = v_inv.user_id AND currency = v_inv.currency AND type = 'checking';
  SELECT id INTO v_tax_acc FROM public.accounts WHERE user_id = v_inv.user_id AND currency = v_inv.currency AND type = 'tax_setaside';
  IF v_funding IS NULL OR v_checking IS NULL OR v_tax_acc IS NULL THEN RAISE EXCEPTION 'wallets not provisioned'; END IF;

  v_setaside := ROUND(v_inv.subtotal_minor * v_inv.tax_setaside_percent / 100.0)::bigint;
  IF v_setaside < 0 THEN v_setaside := 0; END IF;
  IF v_setaside > v_inv.subtotal_minor THEN v_setaside := v_inv.subtotal_minor; END IF;
  v_to_checking := v_inv.subtotal_minor - v_setaside;

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (v_inv.user_id, p_idempotency_key, 'deposit', 'completed',
    jsonb_build_object('kind','invoice_payment','invoice_id', v_inv.id, 'invoice_number', v_inv.number,
                       'client_name', v_inv.client_name, 'tax_setaside_minor', v_setaside,
                       'tax_setaside_percent', v_inv.tax_setaside_percent))
  RETURNING id INTO v_tx;

  -- Debit funding for the full amount; credit checking + tax_setaside so it balances.
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency)
  VALUES (v_tx, v_funding, 'debit', v_inv.subtotal_minor, v_inv.currency);
  IF v_to_checking > 0 THEN
    INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency)
    VALUES (v_tx, v_checking, 'credit', v_to_checking, v_inv.currency);
  END IF;
  IF v_setaside > 0 THEN
    INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency)
    VALUES (v_tx, v_tax_acc, 'credit', v_setaside, v_inv.currency);
  END IF;

  UPDATE public.invoices
     SET status = 'paid', paid_at = now(), paid_transaction_id = v_tx
   WHERE id = v_inv.id;

  RETURN jsonb_build_object('status','paid','transaction_id', v_tx, 'invoice_id', v_inv.id);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_invoice_by_token(TEXT,TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.pay_invoice_by_token(TEXT,TEXT) TO anon, authenticated;
