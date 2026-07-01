import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Currency } from "@/lib/money";

export type Profile = {
  id: string;
  display_name: string | null;
  home_currency: Currency;
  tax_setaside_percent: number | null;
  onboarded_at: string | null;
};

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, home_currency, tax_setaside_percent, onboarded_at")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile) ?? null;
    },
  });
}

export function useUpdateHomeCurrency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (currency: Currency) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ home_currency: currency })
        .eq("id", auth.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export function useMarkOnboarded() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ onboarded_at: new Date().toISOString() })
        .eq("id", auth.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}
