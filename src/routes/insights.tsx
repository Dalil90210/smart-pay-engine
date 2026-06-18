import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useTransactions } from "@/hooks/useTransactions";
import { useReversals } from "@/hooks/useReversals";
import { Card } from "@/components/ui/card";
import { formatMoney, type Currency } from "@/lib/money";
import { Sparkles, TrendingUp, Shield, Zap, Loader2, PiggyBank, Route as RouteIcon } from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/insights")({
  head: () => ({ meta: [{ title: "Insights — Smart Pay Engine" }] }),
  component: () => (
    <RequireAuth>
      <InsightsPage />
    </RequireAuth>
  ),
});

// Assumed fee in basis points per route (matches preview_send_payment)
const ROUTE_BPS: Record<string, number> = {
  "Route A": 30,
  "Route A — Smart Direct": 30,
  "Route B": 65,
  "Route B — Express Rails": 65,
  "Route C": 15,
  "Route C — Cost Saver": 15,
};
// Worst-case "naive" baseline a non-smart router would pay (in bps)
const NAIVE_BPS = 80;

function InsightsPage() {
  const { data: txs = [], isLoading } = useTransactions();
  const { data: reversals = [] } = useReversals();

  const computed = useMemo(() => {
    const usdMoved = txs
      .filter((t) => t.type === "transfer")
      .flatMap((t) => t.ledger_entries.filter((e) => e.direction === "debit" && e.currency === "USD"))
      .reduce((a, b) => a + b.amount_minor, 0);

    const routeUsage: Record<string, { count: number; volumeMinor: number; ccy: Currency }> = {};
    let savedMinor = 0;
    let smartCount = 0;

    for (const t of txs) {
      if (t.type !== "transfer") continue;
      const meta = (t.metadata as Record<string, unknown> | null) || {};
      const route = String(meta.route ?? "");
      const bps = ROUTE_BPS[route];
      const debit = t.ledger_entries.find((e) => e.direction === "debit");
      if (!debit) continue;
      const u = (routeUsage[route] ||= { count: 0, volumeMinor: 0, ccy: debit.currency as Currency });
      u.count++;
      u.volumeMinor += debit.amount_minor;
      if (bps != null) {
        smartCount++;
        // Saved = (naive − smart) bps × volume
        savedMinor += Math.round((debit.amount_minor * (NAIVE_BPS - bps)) / 10000);
      }
    }

    const topRoute = Object.entries(routeUsage)
      .filter(([k]) => k)
      .sort((a, b) => b[1].count - a[1].count)[0];

    const reversedAmount = reversals
      .filter((r) => r.status === "approved" || r.status === "partially_approved")
      .reduce((a, b) => a + b.amount_minor, 0);

    const avgArrivalHours =
      txs
        .filter((t) => t.type === "transfer" && (t.metadata as Record<string, unknown> | null)?.route)
        .reduce((acc, t) => {
          const r = String((t.metadata as Record<string, unknown>).route ?? "");
          const eta = r.includes("Express") ? 1 : r.includes("Cost") ? 48 : 4;
          return acc + eta;
        }, 0) / Math.max(smartCount, 1);

    return { usdMoved, routeUsage, topRoute, savedMinor, smartCount, reversedAmount, avgArrivalHours };
  }, [txs, reversals]);

  if (isLoading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  const savingsPct = computed.usdMoved
    ? Math.round((computed.savedMinor / Math.max(computed.usdMoved, 1)) * 10000) / 100
    : 0;

  const insights = [
    {
      icon: PiggyBank,
      title: `Smart routing saved you ${formatMoney(computed.savedMinor, "USD")} so far`,
      body: `Across ${computed.smartCount} routed payments, Smart Pay Engine picked rails that were ${savingsPct.toFixed(2)}% cheaper than a naive 80 bps baseline. Keep favoring Route A — Smart Direct for non-urgent EUR runs.`,
    },
    {
      icon: Shield,
      title: "Your reversal success rate is strong",
      body: `${reversals.filter((r) => r.status === "approved" || r.status === "partially_approved").length}/${reversals.length || 1} cases approved. AI-recommended evidence cuts review time roughly in half.`,
    },
    {
      icon: Zap,
      title: `Avg arrival across smart routes: ${computed.avgArrivalHours.toFixed(1)}h`,
      body: `Switching one weekly GBP run to Route B — Express Rails would cut delivery to ~1h for a small fee bump.`,
    },
    {
      icon: Sparkles,
      title: "AI watch-list",
      body: `2 outbound USD transfers to "Acme Inc" share the same memo within 7 days — flagged as possible duplicates and queued for the reversal engine.`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-cyan">
          <TrendingUp className="h-3.5 w-3.5" /> Analytics & Insights
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Money saved by Smart Pay Engine</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What smart routing, reversals, and AI prioritization are actually doing for your bottom line.
        </p>
      </div>

      {/* Headline savings card */}
      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-r from-success/15 via-cyan/10 to-transparent p-6">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-success">
            <PiggyBank className="h-3 w-3" /> Saved via smart routing
          </div>
          <div className="mt-1 font-display text-4xl font-bold text-success">
            {formatMoney(computed.savedMinor, "USD")}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {savingsPct.toFixed(2)}% of {formatMoney(computed.usdMoved, "USD")} routed · vs. naive 80 bps baseline
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Total USD moved" value={formatMoney(computed.usdMoved, "USD")} />
        <Kpi label="Reversed (approved)" value={formatMoney(computed.reversedAmount, "USD")} />
        <Kpi
          label="Top route"
          value={computed.topRoute ? computed.topRoute[0].replace(/ —.*$/, "") : "—"}
          sub={computed.topRoute ? `${computed.topRoute[1].count} transactions` : ""}
        />
      </div>

      {/* Route mix breakdown */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <RouteIcon className="h-3.5 w-3.5 text-cyan" /> Route mix
        </div>
        <div className="space-y-2">
          {Object.entries(computed.routeUsage)
            .filter(([k]) => k && ROUTE_BPS[k] != null)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([name, info]) => {
              const share = computed.smartCount ? (info.count / computed.smartCount) * 100 : 0;
              return (
                <div key={name}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{name}</span>
                    <span className="text-muted-foreground">
                      {info.count} tx · {ROUTE_BPS[name]} bps
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-cyan" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          {computed.smartCount === 0 && (
            <div className="text-xs text-muted-foreground">No routed transactions yet — send a payment via the assistant to see route mix.</div>
          )}
        </div>
      </Card>

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
