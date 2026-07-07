import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useState } from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions, type TxRow } from "@/hooks/useTransactions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionRow } from "@/components/TransactionRow";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Shield, Sparkles, Search } from "lucide-react";
import { useCreateThread } from "@/hooks/useThreads";
import { toast } from "sonner";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Activity — Smart Pay Engine" },
      {
        name: "description",
        content:
          "Browse every send, conversion and reversal across your Smart Pay Engine accounts, with live ledger updates.",
      },
      { property: "og:title", content: "Activity — Smart Pay Engine" },
      {
        property: "og:description",
        content:
          "Browse every send, conversion and reversal across your Smart Pay Engine accounts, with live ledger updates.",
      },
      { property: "og:url", content: "https://app.smartpayengine.com/transactions" },
    ],
    links: [{ rel: "canonical", href: "https://app.smartpayengine.com/transactions" }],
  }),
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
  const [search, setSearch] = useState("");
  const [openTx, setOpenTx] = useState<TxRow | null>(null);

  const filtered = (txs ?? []).filter((t) => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (stateFilter !== "all" && t.state !== stateFilter) return false;
    if (search.trim()) {
      const m = (t.metadata as Record<string, unknown>) || {};
      const hay = JSON.stringify(m).toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All your sandbox transactions, double-entry verified.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payee or memo"
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="deposit">Deposit</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
            <SelectItem value="fx">FX</SelectItem>
            <SelectItem value="reversal">Reversal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="card-glass overflow-hidden p-0">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No transactions match these filters.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((tx) => (
              <button key={tx.id} onClick={() => setOpenTx(tx)} className="block w-full text-left">
                <TransactionRow tx={tx} accounts={accounts ?? []} />
              </button>
            ))}
          </div>
        )}
      </Card>

      {openTx && <TxDetail tx={openTx} onClose={() => setOpenTx(null)} />}
    </div>
  );
}

function TxDetail({ tx, onClose }: { tx: TxRow; onClose: () => void }) {
  const meta = (tx.metadata as Record<string, unknown>) || {};
  const navigate = useNavigate();
  const createThread = useCreateThread();
  const canReverse = tx.type === "transfer" && tx.state === "completed";

  const askAssistant = async () => {
    const t = await createThread.mutateAsync(undefined);
    const prompt = `Analyze a reversal for transaction ${tx.id}. The recipient was ${meta.payee ?? "unknown"}, memo: "${meta.memo ?? ""}".`;
    toast.message("Opening assistant…");
    navigate({ to: "/assistant/$threadId", params: { threadId: t.id }, search: { q: prompt } });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <Card className="w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Transaction
            </div>
            <div className="font-display text-lg font-semibold capitalize">{tx.type}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(tx.created_at).toLocaleString()}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid gap-3 rounded-lg border border-border bg-background/50 p-3 text-sm">
          {meta.payee != null && <Row label="Payee" value={String(meta.payee)} />}
          {meta.memo != null && <Row label="Memo" value={String(meta.memo)} />}
          {meta.route != null && <Row label="Route" value={String(meta.route)} />}
          <Row label="State" value={tx.state} />
          <Row label="ID" value={tx.id.slice(0, 12)} mono />
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ledger</div>
          {tx.ledger_entries.map((e) => (
            <div key={e.id} className="flex justify-between text-xs">
              <span className="text-muted-foreground capitalize">{e.direction}</span>
              <span className={e.direction === "credit" ? "text-success" : "text-foreground"}>
                {e.direction === "credit" ? "+" : "−"}
                {(e.amount_minor / 100).toFixed(2)} {e.currency}
              </span>
            </div>
          ))}
        </div>
        {canReverse && (
          <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
            <Button className="flex-1 gap-2" onClick={askAssistant}>
              <Sparkles className="h-4 w-4" /> Analyze with AI
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={askAssistant}>
              <Shield className="h-4 w-4" /> Request Reversal
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}
