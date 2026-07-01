
-- 1) Home currency preference
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_currency public.currency_code NOT NULL DEFAULT 'USD';

-- 2) Extend account_type enum with fee_revenue
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'account_type' AND e.enumlabel = 'fee_revenue'
  ) THEN
    ALTER TYPE public.account_type ADD VALUE 'fee_revenue';
  END IF;
END $$;
