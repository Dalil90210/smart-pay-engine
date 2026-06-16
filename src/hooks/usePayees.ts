import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Currency } from "@/lib/money";

export type Payee = {
  id: string;
  name: string;
  account_ref: string;
  currency: Currency;
};

export function usePayees() {
  return useQuery({
    queryKey: ["payees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payees")
        .select("id, name, account_ref, currency")
        .order("name");
      if (error) throw error;
      return data as Payee[];
    },
  });
}
