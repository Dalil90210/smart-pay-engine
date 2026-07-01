import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Currency } from "@/lib/money";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";

export type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price_minor: number;
  position: number;
};

export type Invoice = {
  id: string;
  number: string;
  client_name: string;
  client_email: string | null;
  currency: Currency;
  due_date: string;
  status: InvoiceStatus;
  subtotal_minor: number;
  tax_setaside_percent: number;
  share_token: string;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  invoice_items?: InvoiceItem[];
};

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }> };
        };
      })
        .from("invoices")
        .select("id, number, client_name, client_email, currency, due_date, status, subtotal_minor, tax_setaside_percent, share_token, notes, paid_at, created_at, invoice_items(id, description, quantity, unit_price_minor, position)")
        .order("created_at", { ascending: false });
      if (error) throw error as Error;
      const rows = (data as Invoice[] | null) ?? [];
      const today = new Date().toISOString().slice(0, 10);
      return rows.map((i) => ({
        ...i,
        status: (i.status === "sent" && i.due_date < today ? "overdue" : i.status) as InvoiceStatus,
        subtotal_minor: Number(i.subtotal_minor) || 0,
        tax_setaside_percent: Number(i.tax_setaside_percent) || 0,
      }));
    },
  });
}
