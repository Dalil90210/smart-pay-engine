import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Currency } from "@/lib/money";

export type ReversalStatus =
  "submitted" | "under_review" | "approved" | "partially_approved" | "rejected";

export type Reversal = {
  id: string;
  transaction_id: string;
  status: ReversalStatus;
  reason_code: string;
  amount_minor: number;
  currency: Currency;
  success_probability: number;
  priority_score: number;
  ai_recommendation: string | null;
  evidence: { name: string; uploaded_at: string }[];
  timeline: { at: string; label: string; note?: string }[];
  created_at: string;
  updated_at: string;
};

export function useReversals() {
  return useQuery({
    queryKey: ["reversals"],
    queryFn: async (): Promise<Reversal[]> => {
      const { data, error } = await supabase
        .from("reversals")
        .select("*")
        .order("priority_score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Reversal[];
    },
  });
}

export function useCreateReversal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      transaction_id: string;
      reason_code: string;
      amount_minor: number;
      currency: Currency;
      success_probability: number;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("reversals")
        .insert({
          user_id: u.user.id,
          transaction_id: args.transaction_id,
          reason_code: args.reason_code,
          amount_minor: args.amount_minor,
          currency: args.currency,
          success_probability: args.success_probability,
          priority_score: Math.round(args.success_probability * 100),
          ai_recommendation: "Opened manually.",
          timeline: [{ at: new Date().toISOString(), label: "Submitted" }],
        })
        .select()
        .single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["reversals"] });
      return data;
    },
  });
}

export function useUpdateReversal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      status?: ReversalStatus;
      addEvidence?: string;
      addTimeline?: { label: string; note?: string };
    }) => {
      const { data: existing } = await supabase
        .from("reversals")
        .select("evidence, timeline")
        .eq("id", args.id)
        .single();
      const evidence =
        (existing?.evidence as unknown as { name: string; uploaded_at: string }[]) ?? [];
      const timeline =
        (existing?.timeline as unknown as { at: string; label: string; note?: string }[]) ?? [];
      if (args.addEvidence)
        evidence.push({ name: args.addEvidence, uploaded_at: new Date().toISOString() });
      if (args.addTimeline) timeline.push({ at: new Date().toISOString(), ...args.addTimeline });
      const update: Record<string, unknown> = { evidence, timeline };
      if (args.status) update.status = args.status;
      const { error } = await supabase
        .from("reversals")
        .update(update as never)
        .eq("id", args.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["reversals"] });
    },
  });
}
