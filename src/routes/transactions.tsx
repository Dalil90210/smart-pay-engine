import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useState } from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { Card } from "@/components/ui/card";
import { TransactionRow } from "@/components/TransactionRow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/transactions")({
  head: () => ({ meta: [{ title: "Activity — Smart Pay Engine" }] }),
  component: () => (
    <RequireAuth>
      <ActivityPage />
    </RequireAuth>
  ),
});

function ActivityPage() {
  const { data: accounts } = useAccounts();
  const { data: txs, isLoading } = useTransactions();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");

  const filtered = (txs ?? []).filter((t) => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (stateFilter !== "all" && t.state !== stateFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">All your sandbox transactions, double-entry verified.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="deposit">Deposit</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
            <SelectItem value="fx">FX</SelectItem>
            <SelectItem value="withdrawal">Withdrawal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="State" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="initiated">Initiated</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="card-glass overflow-hidden p-0">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No transactions match these filters.</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} accounts={accounts ?? []} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
