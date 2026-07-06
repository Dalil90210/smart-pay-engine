import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StateBadge } from "@/components/StateBadge";
import { SandboxBadge } from "@/components/SandboxBadge";
import { formatMoney, CURRENCIES, type Currency } from "@/lib/money";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Scale,
  Clock,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/ledger-integrity")({
  head: () => ({
    meta: [
      { title: "Ledger integrity — Smart Pay Engine" },
      { name: "description", content: "Live double-entry ledger audit for your sandbox wallet." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <LedgerIntegrityPage />
    </RequireAuth>
  ),
});

type Tx = {
  id: string;
  state: "initiated" | "processing" | "completed" | "reversed" | "failed" | "confirmed";
  type: string;
  created_at: string;
};
type Entry = {
  transaction_id: string;
  direction: "debit" | "credit";
  amount_minor: number;
  currency: Currency;
};

function LedgerIntegrityPage() {
  const q = useQuery({
    queryKey: ["ledger-integrity"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const [txRes, entriesRes, balRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, state, type, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("ledger_entries").select("transaction_id, direction, amount_minor, currency"),
        supabase.from("account_balances").select("currency, type, balance_minor"),
      ]);
      if (txRes.error) throw txRes.error;
      if (entriesRes.error) throw entriesRes.error;
      if (balRes.error) throw balRes.error;
      return {
        transactions: (txRes.data ?? []) as Tx[],
        entries: ((entriesRes.data ?? []) as unknown as Entry[]).map((e) => ({
          ...e,
          amount_minor: Number(e.amount_minor) || 0,
        })),
        balances: (
          (balRes.data ?? []) as {
            currency: Currency;
            type: string;
            balance_minor: number | string;
          }[]
        ).map((b) => ({
          ...b,
          balance_minor: Number(b.balance_minor) || 0,
        })),
      };
    },
  });

  const audit = useMemo(() => {
    if (!q.data) return null;
    const { transactions, entries, balances } = q.data;

    // Per-tx balance check
    const byTx = new Map<string, Map<Currency, number>>();
    for (const e of entries) {
      const m = byTx.get(e.transaction_id) ?? new Map<Currency, number>();
      const delta = (e.direction === "credit" ? 1 : -1) * e.amount_minor;
      m.set(e.currency, (m.get(e.currency) ?? 0) + delta);
      byTx.set(e.transaction_id, m);
    }
    const imbalanced: { txId: string; currency: Currency; delta: number }[] = [];
    for (const [txId, m] of byTx.entries()) {
      for (const [ccy, d] of m.entries())
        if (d !== 0) imbalanced.push({ txId, currency: ccy, delta: d });
    }

    // Per-currency totals
    const totals = CURRENCIES.map((ccy) => {
      let debits = 0,
        credits = 0;
      for (const e of entries) {
        if (e.currency !== ccy) continue;
        if (e.direction === "debit") debits += e.amount_minor;
        else credits += e.amount_minor;
      }
      const heldMinor = balances
        .filter(
          (b) => b.currency === ccy && ["checking", "tax_setaside", "fee_revenue"].includes(b.type),
        )
        .reduce((a, b) => a + b.balance_minor, 0);
      return { currency: ccy, debits, credits, delta: credits - debits, heldMinor };
    });

    // Stuck (non-terminal > 24h)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const nonTerminal = new Set(["initiated", "processing", "confirmed"]);
    const stuck = transactions.filter(
      (t) => nonTerminal.has(t.state) && new Date(t.created_at).getTime() < cutoff,
    );

    return { totals, imbalanced, stuck, transactions };
  }, [q.data]);

  if (q.isLoading || !audit) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const healthy = audit.imbalanced.length === 0;
  const anyStuck = audit.stuck.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-cyan" />
            <h1 className="font-display text-2xl font-semibold">Ledger integrity</h1>
            <SandboxBadge />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Live double-entry audit across every transaction in your wallet. Read-only.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="gap-2"
        >
          <RefreshCw className={q.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </header>

      {healthy ? (
        <Card className="flex items-center gap-3 border-success/30 bg-success/10 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <div>
            <div className="font-medium text-success">All transactions balance</div>
            <div className="text-xs text-muted-foreground">
              Verified {audit.transactions.length} transactions · every currency nets to zero
              (debits = credits).
            </div>
          </div>
        </Card>
      ) : (
        <Card className="flex items-start gap-3 border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <div className="font-medium text-destructive">
              Imbalance detected — {audit.imbalanced.length} entr
              {audit.imbalanced.length === 1 ? "y" : "ies"} out of balance
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              The ledger has drifted. Investigate the transactions listed below before trusting any
              balance.
            </div>
          </div>
        </Card>
      )}

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Scale className="h-3.5 w-3.5" /> System value & balance check
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {audit.totals.map((t) => {
            const balanced = t.delta === 0;
            return (
              <Card key={t.currency} className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{t.currency}</span>
                  </div>
                  <span
                    className={
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " +
                      (balanced
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-destructive/40 bg-destructive/10 text-destructive")
                    }
                  >
                    {balanced ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertTriangle className="h-3 w-3" />
                    )}
                    {balanced ? "balanced" : "imbalanced"}
                  </span>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Held (wallet + reserves)
                  </div>
                  <div className="font-display text-2xl font-bold">
                    {formatMoney(t.heldMinor, t.currency)}
                  </div>
                </div>
                <div className="space-y-1 border-t border-border pt-2 text-xs">
                  <Row label="Total debits" value={formatMoney(t.debits, t.currency)} />
                  <Row label="Total credits" value={formatMoney(t.credits, t.currency)} />
                  <Row
                    label="Delta"
                    value={formatMoney(t.delta, t.currency)}
                    valueClass={balanced ? "text-success" : "text-destructive"}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> Stuck transactions ({audit.stuck.length})
        </h2>
        <Card className="p-0">
          {audit.stuck.length === 0 ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              No transactions have been stuck in a non-terminal state for more than 24 hours.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {audit.stuck.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs">{t.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.type} · stuck for {formatDistanceToNow(new Date(t.created_at))}
                    </div>
                  </div>
                  <StateBadge state={t.state} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        {anyStuck && (
          <p className="mt-2 text-xs text-amber-500">
            These transactions never reached a terminal state. In production this would page the ops
            team.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Reconciliation · every transaction
        </h2>
        <Card className="p-0">
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Transaction</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                  <th className="px-3 py-2 text-right font-medium">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {audit.transactions.map((t) => {
                  const bad = audit.imbalanced.some((i) => i.txId === t.id);
                  return (
                    <tr key={t.id} className={bad ? "bg-destructive/5" : undefined}>
                      <td className="px-3 py-2 font-mono text-xs">{t.id.slice(0, 8)}…</td>
                      <td className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                        {t.type}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {bad ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                            <AlertTriangle className="h-3 w-3" /> imbalanced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-success">
                            <CheckCircle2 className="h-3 w-3" /> ok
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <StateBadge state={t.state} />
                      </td>
                    </tr>
                  );
                })}
                {audit.transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                      No transactions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={"font-mono tabular-nums " + (valueClass ?? "")}>{value}</span>
    </div>
  );
}
