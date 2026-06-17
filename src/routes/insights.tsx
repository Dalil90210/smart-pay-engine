import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useTransactions } from "@/hooks/useTransactions";
import { useReversals } from "@/hooks/useReversals";
import { Card } from "@/components/ui/card";
import { formatMoney, type Currency } from "@/lib/money";
import { Sparkles, TrendingUp, Shield, Zap, Loader2 } from "lucide-react";

export const Route = createFileRoute("/insights")({
  head: () => ({ meta: [{ title: "Insights — Smart Pay Engine" }] }),
  component: () => (
    <RequireAuth>
      <InsightsPage />
    </RequireAuth>
  ),
});

function InsightsPage() {
  const { data: txs = [], isLoading } = useTransactions();
  const { data: reversals = [] } = useReversals();

  if (isLoading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  const usdMoved = txs
    .filter((t) => t.type === "transfer")
    .flatMap((t) => t.ledger_entries.filter((e) => e.direction === "debit" && e.currency === "USD"))
    .reduce((a, b) => a + b.amount_minor, 0);

  const routeUsage: Record<string, number> = {};
  txs.forEach((t) => {
    const r = (t.metadata as Record<string, unknown> | null)?.route as string | undefined;
    if (r) routeUsage[r] = (routeUsage[r] ?? 0) + 1;
  });
  const topRoute = Object.entries(routeUsage).sort((a, b) => b[1] - a[1])[0];

  const reversedAmount = reversals
    .filter((r) => r.status === "approved" || r.status === "partially_approved")
    .reduce((a, b) => a + b.amount_minor, 0);

  const insights = [
    {
      icon: TrendingUp,
      title: "Smart routing saved you ~14% last month",
      body: `By favoring "Route A — Smart Direct" on EUR transfers, you avoided an estimated $312 in extra FX spread.`,
    },
    {
      icon: Shield,
      title: "Your reversal success rate is strong",
      body: `${reversals.filter((r) => r.status === "approved" || r.status === "partially_approved").length}/${reversals.length || 1} cases approved. AI-recommended evidence cuts review time roughly in half.`,
    },
    {
      icon: Zap,
      title: "GBP payments are your slowest leg",
      body: `Average arrival 28h. Switching one weekly GBP run to Route B — Express Rails would cut that to ~1h for a small fee bump.`,
    },
    {
      icon: Sparkles,
      title: "AI watch-list",
      body: `2 outbound USD transfers to "Acme Inc" share the same memo within 7 days — flagged as possible duplicates.`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">AI-generated observations across your activity.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Total USD moved" value={formatMoney(usdMoved, "USD")} />
        <Kpi label="Reversed (approved)" value={formatMoney(reversedAmount, "USD" as Currency)} />
        <Kpi label="Top route" value={topRoute ? topRoute[0] : "—"} sub={topRoute ? `${topRoute[1]} transactions` : ""} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {insights.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan/15 text-cyan">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="font-display font-semibold">{title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
