CREATE OR REPLACE FUNCTION public.get_invoice_by_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'tax_setaside_percent', v_inv.tax_setaside_percent,
    'notes', v_inv.notes,
    'biller_name', COALESCE(v_biller, 'Smart Pay Engine user'),
    'items', v_items
  );
END;
$function$;