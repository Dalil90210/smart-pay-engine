import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { BalanceCard } from "@/components/BalanceCard";
import { TransactionRow } from "@/components/TransactionRow";
import { useAccounts, useBalances } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Plus, ArrowRightLeft, Sparkles, Loader2 } from "lucide-react";
import { CURRENCIES } from "@/lib/money";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Smart Pay Engine" },
      { name: "description", content: "Your multi-currency dashboard." },
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

  const checking = (balances || []).filter((b) => b.type === "checking");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here's a snapshot of your multi-currency wallet.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Balances</h2>
        </div>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CURRENCIES.map((ccy, i) => {
              const b = checking.find((x) => x.currency === ccy);
              return (
                <BalanceCard
                  key={ccy}
                  currency={ccy}
                  balanceMinor={b?.balance_minor ?? 0}
                  highlight={i === 0}
                />
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickAction to="/send" icon={Send} label="Send" />
          <QuickAction to="/add-funds" icon={Plus} label="Add funds" />
          <QuickAction to="/convert" icon={ArrowRightLeft} label="Convert" />
          <QuickAction to="/hive" icon={Sparkles} label="Hive" />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent activity</h2>
          <Link to="/transactions" className="text-xs font-medium text-primary hover:underline">View all</Link>
        </div>
        <Card className="card-glass overflow-hidden p-0">
          {!txs ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : txs.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No transactions yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {txs.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} accounts={accounts || []} />
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: typeof Send; label: string }) {
  return (
    <Link to={to}>
      <Button variant="outline" className="h-auto w-full flex-col gap-2 py-4 card-glass hover:border-primary/40">
        <Icon className="h-5 w-5 text-primary" />
        <span className="text-xs font-medium">{label}</span>
      </Button>
    </Link>
  );
}
