import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Currency } from "@/lib/money";

export type Account = {
  id: string;
  currency: Currency;
  type: "checking" | "funding" | "fx_suspense";
};

export type Balance = {
  account_id: string;
  currency: Currency;
  type: "checking" | "funding" | "fx_suspense";
  balance_minor: number;
};

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, currency, type")
        .order("currency");
      if (error) throw error;
      return data as Account[];
    },
  });
}

export function useBalances() {
  return useQuery({
    queryKey: ["balances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_balances")
        .select("account_id, currency, type, balance_minor");
      if (error) throw error;
      return (data || []).map((r) => ({
        ...r,
        balance_minor: Number(r.balance_minor) || 0,
      })) as Balance[];
    },
  });
}

export function useCheckingAccount(currency: Currency) {
  const { data: accounts } = useAccounts();
  return accounts?.find((a) => a.currency === currency && a.type === "checking");
}
