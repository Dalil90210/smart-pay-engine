import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, Download, Sparkles, Send, Loader2 } from "lucide-react";
import { useState } from "react";
import { formatMoney, type Currency } from "@/lib/money";
import { toast } from "sonner";

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Smart Pay Engine" },
      { name: "description", content: "AI-generated, payment-ready invoices across currencies." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell><Invoices /></AppShell>
    </RequireAuth>
  ),
});

type Invoice = {
  id: string;
  number: string;
  client: string;
  amount_minor: number;
  currency: Currency;
  status: "draft" | "sent" | "paid" | "overdue";
  due: string;
  issued: string;
};

const SEED: Invoice[] = [
  { id: "1", number: "INV-2041", client: "Maria López",  amount_minor: 125000, currency: "EUR", status: "paid",    due: "2026-05-20", issued: "2026-05-06" },
  { id: "2", number: "INV-2042", client: "James Carter", amount_minor:  89000, currency: "GBP", status: "paid",    due: "2026-05-28", issued: "2026-05-14" },
  { id: "3", number: "INV-2043", client: "Acme Inc",     amount_minor: 245000, currency: "USD", status: "sent",    due: "2026-06-22", issued: "2026-06-08" },
  { id: "4", number: "INV-2044", client: "Sofia Rossi",  amount_minor:  32000, currency: "EUR", status: "overdue", due: "2026-06-01", issued: "2026-05-18" },
  { id: "5", number: "INV-2045", client: "Müller GmbH",  amount_minor: 210000, currency: "EUR", status: "sent",    due: "2026-06-30", issued: "2026-06-16" },
  { id: "6", number: "INV-2046", client: "Northwind Co", amount_minor: 184000, currency: "USD", status: "draft",   due: "2026-07-05", issued: "2026-06-17" },
];

const statusStyle: Record<Invoice["status"], string> = {
  draft:   "bg-muted text-muted-foreground border-border",
  sent:    "bg-cyan/15 text-cyan border-cyan/30",
  paid:    "bg-success/15 text-success border-success/30",
  overdue: "bg-destructive/15 text-destructive border-destructive/30",
};

function Invoices() {
  const [items, setItems] = useState<Invoice[]>(SEED);
  const [showNew, setShowNew] = useState(false);

  const total = items.filter(i => i.status !== "draft").reduce((a, b) => a + b.amount_minor, 0);
  const outstanding = items.filter(i => i.status === "sent" || i.status === "overdue").reduce((a, b) => a + b.amount_minor, 0);
  const paidCount = items.filter(i => i.status === "paid").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-cyan">
            <FileText className="h-3.5 w-3.5" /> Invoices
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Smart invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">AI drafts professional, payment-ready invoices in any currency.</p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New invoice
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total billed (sandbox)" value={formatMoney(total, "USD")} />
        <Stat label="Outstanding" value={formatMoney(outstanding, "USD")} accent />
        <Stat label="Paid invoices" value={String(paidCount)} />
      </div>

      {showNew && <NewInvoiceCard onClose={() => setShowNew(false)} onCreate={(inv) => { setItems([inv, ...items]); setShowNew(false); }} />}

      <Card className="divide-y divide-border overflow-hidden p-0">
        {items.map((inv) => (
          <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/50">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{inv.client}</span>
                <Badge variant="outline" className={statusStyle[inv.status]}>{inv.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">{inv.number} · due {inv.due}</div>
            </div>
            <div className="text-right">
              <div className="font-display text-sm font-semibold">{formatMoney(inv.amount_minor, inv.currency)}</div>
              <button className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-cyan hover:underline">
                <Download className="h-3 w-3" /> PDF
              </button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${accent ? "text-cyan" : ""}`}>{value}</div>
    </Card>
  );
}

function NewInvoiceCard({ onClose, onCreate }: { onClose: () => void; onCreate: (inv: Invoice) => void }) {
  const [client, setClient] = useState("");
  const [brief, setBrief] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const generate = () => {
    if (!client || !brief) { toast.error("Add a client and a short brief"); return; }
    setGenerating(true);
    setTimeout(() => {
      setDraft(
        `Dear ${client},\n\nThank you for your continued partnership. Please find detailed below the invoice for services rendered:\n\n• ${brief}\n• Delivered in full, on schedule.\n• Net 14 payment terms.\n\nWe appreciate your prompt settlement. Reach out with any questions.\n\nWarm regards,\nSmart Pay Engine on your behalf`
      );
      setGenerating(false);
    }, 900);
  };

  const create = () => {
    const minor = Math.round((parseFloat(amount) || 0) * 100);
    if (!client || !minor) { toast.error("Client and amount required"); return; }
    onCreate({
      id: crypto.randomUUID(),
      number: `INV-${2047 + Math.floor(Math.random() * 99)}`,
      client, amount_minor: minor, currency,
      status: "draft", due: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      issued: new Date().toISOString().slice(0, 10),
    });
    toast.success("Invoice created");
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cyan" />
          <h3 className="font-display text-base font-semibold">AI invoice draft</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Client name" value={client} onChange={(e) => setClient(e.target.value)} />
        <div className="flex gap-2">
          <Input placeholder="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}
            className="rounded-md border border-input bg-background px-2 text-sm">
            <option>USD</option><option>EUR</option><option>GBP</option>
          </select>
        </div>
      </div>
      <Textarea className="mt-3" placeholder="Short brief — e.g. 'Q2 design retainer, 40 hours, brand refresh'"
        value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={generate} disabled={generating} className="gap-2">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          AI draft message
        </Button>
        <Button onClick={create} className="gap-2"><Send className="h-4 w-4" /> Create draft</Button>
      </div>
      {draft && (
        <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground">
          {draft}
        </pre>
      )}
    </Card>
  );
}
