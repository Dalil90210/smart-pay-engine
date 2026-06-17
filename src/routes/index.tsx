import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { BalanceCard } from "@/components/BalanceCard";
import { TransactionRow } from "@/components/TransactionRow";
import { useAccounts, useBalances } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { useReversals } from "@/hooks/useReversals";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, ArrowRightLeft, Sparkles, Loader2, Shield, TrendingUp } from "lucide-react";
import { CURRENCIES, formatMoney } from "@/lib/money";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Smart Pay Engine" },
      { name: "description", content: "Smart Pay Engine — AI payment intelligence across USD, EUR, GBP." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  ),
});

function Dashboard() {
  const { data: accounts } = useAccounts();
  const { data: balances, isLoading } = useBalances();
  const { data: txs } = useTransactions(8);
  const { data: reversals = [] } = useReversals();

  const transferTxs = (txs ?? []).filter((t) => t.type === "transfer");
  const totalMovedUsd = transferTxs
    .flatMap((t) => t.ledger_entries.filter((e) => e.direction === "debit" && e.currency === "USD"))
    .reduce((a, b) => a + b.amount_minor, 0);
  const pendingCount = (txs ?? []).filter((t) => t.state === "processing" || t.state === "initiated").length;
  const closed = reversals.filter((r) => r.status !== "submitted" && r.status !== "under_review");
  const winRate = closed.length
    ? Math.round((closed.filter((r) => r.status === "approved" || r.status === "partially_approved").length / closed.length) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* Hero with AI nudge */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-cyan/10 p-6">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-cyan">
              <Sparkles className="h-3.5 w-3.5" /> AI Payment Intelligence
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Welcome back</h1>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Smart Pay Engine sits on top of your rails. Ask the assistant to send, plan, or reverse — it shows the smartest route and the success odds before anything moves.
            </p>
          </div>
          <Link to="/assistant">
            <Button size="lg" className="gap-2">
              <Sparkles className="h-4 w-4" /> Open Assistant
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi icon={TrendingUp} label="Total moved" value={formatMoney(totalMovedUsd, "USD")} />
        <Kpi icon={Loader2} label="Pending" value={String(pendingCount)} />
        <Kpi icon={Shield} label="Reversal win rate" value={`${winRate}%`} accent />
        <Kpi icon={Sparkles} label="Saved via smart routing" value="~$312" sub="vs. naive routing" />
      </div>

      {/* Balances */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Balances</h2>
          <Link to="/convert" className="text-xs text-cyan hover:underline inline-flex items-center gap-1">
            <ArrowRightLeft className="h-3 w-3" /> Convert
          </Link>
        </div>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CURRENCIES.map((ccy, i) => {
              const b = (balances || []).find((x) => x.currency === ccy && x.type === "checking");
              return <BalanceCard key={ccy} currency={ccy} amountMinor={b?.amount_minor ?? 0} index={i} />;
            })}
          </div>
        )}
      </section>

      {/* Recent activity */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent activity</h2>
          <div className="flex gap-2">
            <Link to="/send"><Button size="sm" variant="outline" className="gap-1"><Send className="h-3.5 w-3.5" /> Send</Button></Link>
            <Link to="/transactions"><Button size="sm" variant="ghost">View all</Button></Link>
          </div>
        </div>
        <Card className="divide-y divide-border overflow-hidden p-0">
          {(txs ?? []).slice(0, 6).map((tx) => (
            <TransactionRow key={tx.id} tx={tx} accounts={accounts || []} />
          ))}
          {(txs ?? []).length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No transactions yet.</div>
          )}
        </Card>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sub, accent,
}: { icon: typeof Sparkles; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`mt-1 font-display text-2xl font-bold ${accent ? "text-cyan" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}
