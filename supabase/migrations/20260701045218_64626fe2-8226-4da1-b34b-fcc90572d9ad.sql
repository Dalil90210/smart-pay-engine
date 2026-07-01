
CREATE TABLE public.invoice_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sandbox',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invoice_reminders_invoice_idx ON public.invoice_reminders(invoice_id, sent_at DESC);

GRANT SELECT ON public.invoice_reminders TO authenticated;
GRANT ALL ON public.invoice_reminders TO service_role;

ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own reminders" ON public.invoice_reminders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "deny direct insert" ON public.invoice_reminders
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "deny direct update" ON public.invoice_reminders
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "deny direct delete" ON public.invoice_reminders
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

CREATE OR REPLACE FUNCTION public.send_invoice_reminder(p_invoice_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_inv public.invoices%ROWTYPE;
  v_biller TEXT;
  v_subject TEXT;
  v_body TEXT;
  v_reminder_id UUID;
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF v_inv.status = 'draft' THEN RAISE EXCEPTION 'send the invoice before reminding'; END IF;
  IF v_inv.status = 'paid' THEN RAISE EXCEPTION 'invoice already paid'; END IF;
  IF v_inv.client_email IS NULL OR length(trim(v_inv.client_email)) = 0 THEN
    RAISE EXCEPTION 'client email required to send reminder';
  END IF;

  SELECT display_name INTO v_biller FROM public.profiles WHERE id = v_user;
  v_biller := COALESCE(v_biller, 'Smart Pay Engine user');

  v_subject := CASE
    WHEN v_inv.due_date < v_today THEN 'Overdue: invoice ' || v_inv.number
    ELSE 'Reminder: invoice ' || v_inv.number || ' due ' || v_inv.due_date::text
  END;

  v_body := 'Hi ' || v_inv.client_name || E',\n\n' ||
            'This is a friendly reminder that invoice ' || v_inv.number ||
            ' for ' || (v_inv.subtotal_minor::numeric / 100)::text || ' ' || v_inv.currency::text ||
            ' is ' ||
            CASE WHEN v_inv.due_date < v_today
                 THEN 'overdue (was due ' || v_inv.due_date::text || ').'
                 ELSE 'due on ' || v_inv.due_date::text || '.'
            END ||
            E'\n\nYou can review and pay it here:\n' ||
            '(share link on file)' ||
            E'\n\nThanks,\n' || v_biller ||
            E'\n\n— Sent from Smart Pay Engine (sandbox)';

  INSERT INTO public.invoice_reminders(invoice_id, user_id, recipient_email, subject, body, channel)
  VALUES (p_invoice_id, v_user, v_inv.client_email, v_subject, v_body, 'sandbox')
  RETURNING id INTO v_reminder_id;

  RETURN jsonb_build_object(
    'reminder_id', v_reminder_id,
    'recipient_email', v_inv.client_email,
    'subject', v_subject,
    'sent_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_invoice_reminder(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_invoice_reminder(UUID) TO authenticated;
