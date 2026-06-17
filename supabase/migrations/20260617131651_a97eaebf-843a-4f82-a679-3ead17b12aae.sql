
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'reversal';
ALTER TYPE public.tx_state ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE public.tx_state ADD VALUE IF NOT EXISTS 'reversed';

DO $$ BEGIN
  CREATE TYPE public.reversal_status AS ENUM ('submitted','under_review','approved','partially_approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own threads" ON public.chat_threads FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  message JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.chat_messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX chat_messages_thread_idx ON public.chat_messages(thread_id, created_at);

CREATE TABLE public.reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  status public.reversal_status NOT NULL DEFAULT 'submitted',
  reason_code TEXT NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency public.currency_code NOT NULL,
  success_probability NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  priority_score INTEGER NOT NULL DEFAULT 50,
  ai_recommendation TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reversals TO authenticated;
GRANT ALL ON public.reversals TO service_role;
ALTER TABLE public.reversals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reversals" ON public.reversals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER reversals_touch BEFORE UPDATE ON public.reversals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER threads_touch BEFORE UPDATE ON public.chat_threads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
    (NEW.id, 'Acme Inc',     '021000021 / 1234567890',         'USD'),
    (NEW.id, 'Sofia Rossi',  'IT60 X054 2811 1010 0000 0123 456','EUR'),
    (NEW.id, 'Müller GmbH',  'DE89 3704 0044 0532 0130 00',    'EUR'),
    (NEW.id, 'John Whitfield','GB82 WEST 1234 5698 7654 32',   'GBP'),
    (NEW.id, 'Northwind Co', '111000025 / 9876543210',          'USD');

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed-t1:'||NEW.id, 'transfer', 'completed',
    jsonb_build_object('seed',true,'payee','Maria López','memo','Invoice #2041','route','Route A'))
  RETURNING id INTO v_tx;
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_chk_eur,'debit',125000,'EUR'),(v_tx, v_funding_eur,'credit',125000,'EUR');

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed-t2:'||NEW.id, 'transfer', 'completed',
    jsonb_build_object('seed',true,'payee','James Carter','memo','Consulting','route','Route B'))
  RETURNING id INTO v_tx;
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_chk_gbp,'debit',89000,'GBP'),(v_tx, v_funding_gbp,'credit',89000,'GBP');

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed-t3:'||NEW.id, 'transfer', 'completed',
    jsonb_build_object('seed',true,'payee','Acme Inc','memo','Duplicate billing','route','Route A','flagged',true))
  RETURNING id INTO v_tx;
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_chk_usd,'debit',45000,'USD'),(v_tx, v_funding_usd,'credit',45000,'USD');
  INSERT INTO public.reversals(user_id, transaction_id, status, reason_code, amount_minor, currency, success_probability, priority_score, ai_recommendation, timeline)
  VALUES (NEW.id, v_tx, 'under_review','duplicate_charge',45000,'USD',0.82,87,
    'High likelihood of full reversal. Attach the original invoice and the duplicate to strengthen the case.',
    jsonb_build_array(
      jsonb_build_object('at',now()-interval '2 days','label','Submitted','note','Auto-flagged as duplicate'),
      jsonb_build_object('at',now()-interval '1 day','label','Under review','note','Counterparty notified')
    ));

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed-t4:'||NEW.id, 'transfer', 'completed',
    jsonb_build_object('seed',true,'payee','Sofia Rossi','memo','Subscription','route','Route C'))
  RETURNING id INTO v_tx;
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_chk_eur,'debit',32000,'EUR'),(v_tx, v_funding_eur,'credit',32000,'EUR');

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed-t5:'||NEW.id, 'transfer', 'completed',
    jsonb_build_object('seed',true,'payee','Müller GmbH','memo','Hardware','route','Route B'))
  RETURNING id INTO v_tx;
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_chk_eur,'debit',210000,'EUR'),(v_tx, v_funding_eur,'credit',210000,'EUR');

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed-t6:'||NEW.id, 'transfer', 'processing',
    jsonb_build_object('seed',true,'payee','John Whitfield','memo','Rent','route','Route A'))
  RETURNING id INTO v_tx;
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_chk_gbp,'debit',150000,'GBP'),(v_tx, v_funding_gbp,'credit',150000,'GBP');

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed-t7:'||NEW.id, 'transfer', 'completed',
    jsonb_build_object('seed',true,'payee','Northwind Co','memo','Service overcharge','route','Route C'))
  RETURNING id INTO v_tx;
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_chk_usd,'debit',128000,'USD'),(v_tx, v_funding_usd,'credit',128000,'USD');
  INSERT INTO public.reversals(user_id, transaction_id, status, reason_code, amount_minor, currency, success_probability, priority_score, ai_recommendation)
  VALUES (NEW.id, v_tx, 'partially_approved','service_not_rendered',64000,'USD',0.91,72,
    'Counterparty agreed to partial refund of 50%. Approve and close.');

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed-fx1:'||NEW.id, 'fx', 'completed',
    jsonb_build_object('seed',true,'from','USD','to','EUR','rate',0.9154))
  RETURNING id INTO v_tx;
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_chk_usd,'debit',50000,'USD'),(v_tx, v_fx_usd,'credit',50000,'USD'),
    (v_tx, v_fx_eur,'debit',45770,'EUR'),(v_tx, v_chk_eur,'credit',45770,'EUR');

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed-fx2:'||NEW.id, 'fx', 'completed',
    jsonb_build_object('seed',true,'from','EUR','to','GBP','rate',0.8557))
  RETURNING id INTO v_tx;
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_chk_eur,'debit',80000,'EUR'),(v_tx, v_fx_eur,'credit',80000,'EUR'),
    (v_tx, v_fx_gbp,'debit',68456,'GBP'),(v_tx, v_chk_gbp,'credit',68456,'GBP');

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed-d2:'||NEW.id, 'deposit', 'completed',
    jsonb_build_object('seed',true,'note','Payroll'))
  RETURNING id INTO v_tx;
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_funding_usd,'debit',320000,'USD'),(v_tx, v_chk_usd,'credit',320000,'USD');

  INSERT INTO public.transactions(user_id, idempotency_key, type, state, metadata)
  VALUES (NEW.id, 'seed-t8:'||NEW.id, 'transfer', 'reversed',
    jsonb_build_object('seed',true,'payee','Acme Inc','memo','Wrong amount','route','Route A'))
  RETURNING id INTO v_tx;
  INSERT INTO public.ledger_entries(transaction_id, account_id, direction, amount_minor, currency) VALUES
    (v_tx, v_chk_usd,'debit',22500,'USD'),(v_tx, v_funding_usd,'credit',22500,'USD');
  INSERT INTO public.reversals(user_id, transaction_id, status, reason_code, amount_minor, currency, success_probability, priority_score, ai_recommendation)
  VALUES (NEW.id, v_tx, 'approved','wrong_amount',22500,'USD',0.95,30,'Approved by counterparty.');

  RETURN NEW;
END;
$function$;
