import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TxRow = {
  id: string;
  type: "deposit" | "withdrawal" | "transfer" | "fx";
  state: "initiated" | "confirmed" | "completed" | "failed";
  metadata: Record<string, unknown> | null;
  created_at: string;
  ledger_entries: {
    id: string;
    direction: "debit" | "credit";
    amount_minor: number;
    currency: "USD" | "EUR" | "GBP";
    account_id: string;
  }[];
};

export function useTransactions(limit?: number) {
  return useQuery({
    queryKey: ["transactions", limit ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("id, type, state, metadata, created_at, ledger_entries(id, direction, amount_minor, currency, account_id)")
        .order("created_at", { ascending: false });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as TxRow[];
    },
  });
}
