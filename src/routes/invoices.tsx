import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, Plus, Send, Loader2, Link as LinkIcon, Trash2, CheckCircle2, PiggyBank, Download, Bell } from "lucide-react";
import { downloadInvoicePdf, buildInvoiceReminderMailto } from "@/lib/invoicePdf";
import { useEffect, useMemo, useState } from "react";
import { formatMoney, toMinor, type Currency, CURRENCIES } from "@/lib/money";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useInvoices, type Invoice, type InvoiceStatus } from "@/hooks/useInvoices";
import { useBalances } from "@/hooks/useAccounts";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Smart Pay Engine" },
      { name: "description", content: "Create and share multi-currency invoices with automatic tax set-aside." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Invoices />
    </RequireAuth>
  ),
});

const statusStyle: Record<InvoiceStatus, string> = {
  draft:   "bg-muted text-muted-foreground border-border",
  sent:    "bg-cyan/15 text-cyan border-cyan/30",
  paid:    "bg-success/15 text-success border-success/30",
  overdue: "bg-destructive/15 text-destructive border-destructive/30",
  void:    "bg-muted text-muted-foreground border-border",
};

function Invoices() {
  const { data: invoices = [], isLoading } = useInvoices();
  const { data: balances = [] } = useBalances();
  const [showNew, setShowNew] = useState(false);
  const qc = useQueryClient();

  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((acc, i) => acc + i.subtotal_minor, 0);
  const paidCount = invoices.filter((i) => i.status === "paid").length;
  const totalBilled = invoices
    .filter((i) => i.status !== "draft")
    .reduce((acc, i) => acc + i.subtotal_minor, 0);

  const taxSetAside = balances
    .filter((b) => b.type === "tax_setaside")
    .reduce<Partial<Record<Currency, number>>>((acc, b) => {
      acc[b.currency] = (acc[b.currency] ?? 0) + b.balance_minor;
      return acc;
    }, {});

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["balances"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-cyan">
            <FileText className="h-3.5 w-3.5" /> Invoices
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Get paid, in any currency</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create an invoice, share the link, and a slice of every payment lands in your tax jar automatically.
          </p>
        </div>
        <Button onClick={() => setShowNew((v) => !v)} className="gap-2">
          <Plus className="h-4 w-4" /> New invoice
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total billed" value={formatMoney(totalBilled, "USD")} hint="Sent + paid, USD-equivalent view" />
        <Stat label="Outstanding" value={formatMoney(outstanding, "USD")} accent />
        <TaxJarStat balances={taxSetAside} />
      </div>

      {showNew && <NewInvoiceForm onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); refresh(); }} />}

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No invoices yet. Create your first one to get paid.</div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} onChanged={refresh} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, accent, hint }: { label: string; value: string; accent?: boolean; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${accent ? "text-cyan" : ""}`}>{value}</div>
      {hint && <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function TaxJarStat({ balances }: { balances: Partial<Record<Currency, number>> }) {
  const entries = CURRENCIES.map((c) => [c, balances[c] ?? 0] as const).filter(([, v]) => v > 0);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <PiggyBank className="h-3 w-3" /> Tax set-aside
      </div>
      {entries.length === 0 ? (
        <div className="mt-1 font-display text-2xl font-bold text-muted-foreground">—</div>
      ) : (
        <div className="mt-1 space-y-0.5">
          {entries.map(([c, v]) => (
            <div key={c} className="font-display text-lg font-bold">{formatMoney(v, c)}</div>
          ))}
        </div>
      )}
      <div className="mt-1 text-[10px] text-muted-foreground">Auto-reserved from paid invoices</div>
    </Card>
  );
}

function InvoiceRow({ invoice, onChanged }: { invoice: Invoice; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/i/${invoice.share_token}`;
  const billerName =
    (user?.user_metadata as { display_name?: string } | undefined)?.display_name ||
    user?.email?.split("@")[0] ||
    "Smart Pay Engine user";

  const send = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("send_invoice" as never, { p_invoice_id: invoice.id } as never);
      if (error) throw error;
      toast.success("Invoice sent — share link is live");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const del = async () => {
    if (!confirm("Delete this draft invoice?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("invoices" as never).delete().eq("id", invoice.id);
      if (error) throw error;
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = () => {
    downloadInvoicePdf({
      number: invoice.number,
      biller_name: billerName,
      client_name: invoice.client_name,
      client_email: invoice.client_email,
      currency: invoice.currency,
      due_date: invoice.due_date,
      status: invoice.status,
      subtotal_minor: invoice.subtotal_minor,
      tax_setaside_percent: Number(invoice.tax_setaside_percent) || 0,
      notes: invoice.notes,
      items: (invoice.invoice_items ?? []).map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unit_price_minor: Number(it.unit_price_minor),
      })),
      share_url: shareUrl,
    });
  };

  const [reminderBusy, setReminderBusy] = useState(false);
  const sendReminder = async () => {
    if (!invoice.client_email) {
      toast.error("Add a client email to send a reminder");
      return;
    }
    setReminderBusy(true);
    try {
      const { data, error } = await supabase.rpc("send_invoice_reminder" as never, { p_invoice_id: invoice.id } as never);
      if (error) throw error;
      const payload = data as { recipient_email: string; subject: string } | null;
      toast.success(`Reminder sent (sandbox) to ${payload?.recipient_email ?? invoice.client_email}`, {
        description: payload?.subject,
      });
      qc.invalidateQueries({ queryKey: ["invoice-reminders", invoice.id] });
    } catch (e) {
      toast.error((e as Error).message || "Could not send reminder");
    } finally {
      setReminderBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/50">
        <FileText className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{invoice.client_name}</span>
          <Badge variant="outline" className={statusStyle[invoice.status]}>{invoice.status}</Badge>
          {invoice.tax_setaside_percent > 0 && (
            <Badge variant="outline" className="border-cyan/30 bg-cyan/10 text-cyan">
              <PiggyBank className="mr-1 h-3 w-3" />{Number(invoice.tax_setaside_percent)}% tax
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{invoice.number} · due {invoice.due_date}</div>
      </div>
      <div className="flex items-center gap-1">
        <div className="mr-2 text-right">
          <div className="font-display text-sm font-semibold">{formatMoney(invoice.subtotal_minor, invoice.currency)}</div>
        </div>
        {invoice.status === "draft" ? (
          <>
            <Button size="sm" variant="outline" onClick={send} disabled={busy} className="gap-1">
              <Send className="h-3 w-3" /> Send
            </Button>
            <Button size="icon" variant="ghost" onClick={downloadPdf} title="Download PDF"><Download className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={del} disabled={busy}><Trash2 className="h-4 w-4" /></Button>
          </>
        ) : invoice.status === "paid" ? (
          <>
            <Button size="sm" variant="ghost" disabled className="gap-1 text-success">
              <CheckCircle2 className="h-3 w-3" /> Paid
            </Button>
            <Button size="icon" variant="ghost" onClick={downloadPdf} title="Download PDF"><Download className="h-4 w-4" /></Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={sendReminder} className="gap-1" title="Send reminder email">
              <Bell className="h-3 w-3" /> Remind
            </Button>
            <Button size="icon" variant="ghost" onClick={copyLink} title="Copy share link"><LinkIcon className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={downloadPdf} title="Download PDF"><Download className="h-4 w-4" /></Button>
          </>
        )}
      </div>
    </div>
  );
}

type DraftItem = { description: string; quantity: string; unit_price: string };

function NewInvoiceForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [taxPct, setTaxPct] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ description: "", quantity: "1", unit_price: "" }]);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();

  // Prefill tax % from profile
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as unknown as {
        from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { tax_setaside_percent?: number } | null }> } } };
      }).from("profiles").select("tax_setaside_percent").eq("id", user.id).maybeSingle();
      if (data && data.tax_setaside_percent != null) setTaxPct(String(data.tax_setaside_percent));
    })();
  }, [user]);

  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + Math.round((parseFloat(it.quantity) || 0) * toMinor(it.unit_price || "0")), 0),
    [items],
  );
  const setasidePreview = Math.round((subtotal * (parseFloat(taxPct) || 0)) / 100);

  const updateItem = (idx: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const submit = async (send: boolean) => {
    if (!clientName.trim()) return toast.error("Client name required");
    const cleanItems = items
      .filter((it) => it.description.trim() && (parseFloat(it.unit_price) || 0) > 0)
      .map((it) => ({
        description: it.description.trim(),
        quantity: parseFloat(it.quantity) || 1,
        unit_price_minor: toMinor(it.unit_price),
      }));
    if (cleanItems.length === 0) return toast.error("Add at least one line item with a price");

    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_invoice" as never, {
        p_client_name: clientName.trim(),
        p_client_email: clientEmail.trim(),
        p_currency: currency,
        p_due_date: dueDate,
        p_items: cleanItems,
        p_tax_setaside_percent: taxPct === "" ? null : parseFloat(taxPct),
        p_notes: notes.trim() || null,
        p_send: send,
      } as never);
      if (error) throw error;
      toast.success(send ? "Invoice sent" : "Draft saved");
      void data;
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">New invoice</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Client name</Label>
          <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Acme Inc" />
        </div>
        <div>
          <Label className="text-xs">Client email (optional)</Label>
          <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="billing@acme.com" />
        </div>
        <div>
          <Label className="text-xs">Currency</Label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
        <Label className="text-xs">Line items</Label>
        <div className="mt-2 space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_70px_110px_auto] gap-2">
              <Input placeholder="Description" value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} />
              <Input placeholder="Qty" inputMode="decimal" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} />
              <Input placeholder="Unit price" inputMode="decimal" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: e.target.value })} />
              <Button size="icon" variant="ghost" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setItems((p) => [...p, { description: "", quantity: "1", unit_price: "" }])} className="gap-1">
            <Plus className="h-3 w-3" /> Add item
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Tax set-aside %</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input type="number" min={0} max={100} step={1} value={taxPct} onChange={(e) => setTaxPct(e.target.value)} placeholder="e.g. 25" />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Applied to the paid amount and routed into your {currency} tax jar.
          </p>
        </div>
        <div>
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, thank-you note, etc." />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">{formatMoney(subtotal, currency)}</span>
        </div>
        {setasidePreview > 0 && (
          <div className="mt-1 flex items-center justify-between text-xs text-cyan">
            <span>Reserved to tax jar on payment</span>
            <span>{formatMoney(setasidePreview, currency)}</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => submit(false)} disabled={busy}>Save draft</Button>
        <Button onClick={() => submit(true)} disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Create &amp; send
        </Button>
      </div>
    </Card>
  );
}
