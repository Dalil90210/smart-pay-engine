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

/**
 * Check whether a transaction with this idempotency key has already been recorded.
 * Used by money-moving screens to surface a "duplicate blocked" indicator before
 * re-submitting the same request.
 */
export async function isIdempotencyKeyUsed(key: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export type IdempotencyMatch = {
  id: string;
  type: string;
  state: string;
  created_at: string;
};

export type IdempotencyAuditResult = {
  key: string;
  checkedAt: string;
  used: boolean;
  match: IdempotencyMatch | null;
};

/**
 * Audit-flavored idempotency check: returns the matched transaction (if any)
 * along with timing so UI can show the last duplicate-check result.
 */
export async function auditIdempotencyKey(key: string): Promise<IdempotencyAuditResult> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, state, created_at")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) throw error;
  return {
    key,
    checkedAt: new Date().toISOString(),
    used: !!data,
    match: data
      ? { id: data.id, type: String(data.type), state: String(data.state), created_at: data.created_at }
      : null,
  };
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
  const { data, error } = await supabase.rpc("has_pin");
  if (error) throw error;
  return !!data;
}

// Currency type re-export not needed but keeps imports tidy
export type { Currency };
