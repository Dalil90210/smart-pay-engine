import { supabase } from "@/integrations/supabase/client";
import type { Currency } from "@/lib/money";

export type LedgerEntryInput = {
  account_id: string;
  direction: "debit" | "credit";
  amount_minor: number;
};

export async function postTransaction(args: {
  idempotencyKey: string;
  type: "deposit" | "withdrawal" | "transfer" | "fx";
  metadata: Record<string, unknown>;
  entries: LedgerEntryInput[];
}) {
  const { data, error } = await supabase.rpc("post_transaction", {
    p_idempotency_key: args.idempotencyKey,
    p_type: args.type,
    p_metadata: args.metadata as never,
    p_entries: args.entries as never,
  });
  if (error) throw error;
  return data as string;
}

export async function verifyPin(pin: string) {
  const { data, error } = await supabase.rpc("verify_pin", { p_pin: pin });
  if (error) throw error;
  return data as boolean;
}

export async function setPin(pin: string) {
  const { error } = await supabase.rpc("set_pin", { p_pin: pin });
  if (error) throw error;
}

export async function hasPin(): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("pin_hash")
    .maybeSingle();
  if (error) throw error;
  return !!data?.pin_hash;
}

// Currency type re-export not needed but keeps imports tidy
export type { Currency };
