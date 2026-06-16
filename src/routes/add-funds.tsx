import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useState } from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES, CURRENCY_SYMBOL, toMinor, type Currency, formatMoney } from "@/lib/money";
import { isIdempotencyKeyUsed, postTransaction } from "@/lib/ledger";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { IdempotencyIndicator, type IdempotencyStatus } from "@/components/IdempotencyIndicator";

export const Route = createFileRoute("/add-funds")({
  head: () => ({ meta: [{ title: "Add funds — Smart Pay Engine" }] }),
  component: () => (
    <RequireAuth>
      <AddFundsPage />
    </RequireAuth>
  ),
});

function AddFundsPage() {
  const { data: accounts } = useAccounts();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const amountMinor = toMinor(amount || 0);
  const checking = accounts?.find((a) => a.currency === currency && a.type === "checking");
  const funding = accounts?.find((a) => a.currency === currency && a.type === "funding");

  const submit = async () => {
    if (!checking || !funding || amountMinor <= 0) return;
    setBusy(true);
    try {
      await postTransaction({
        idempotencyKey: crypto.randomUUID(),
        type: "deposit",
        metadata: { description: "Sandbox deposit", amount_minor: amountMinor },
        entries: [
          { account_id: funding.id, direction: "debit", amount_minor: amountMinor },
          { account_id: checking.id, direction: "credit", amount_minor: amountMinor },
        ],
      });
      toast.success(`Added ${formatMoney(amountMinor, currency)} (sandbox)`);
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      navigate({ to: "/" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Add funds</h1>
        <p className="mt-1 text-sm text-muted-foreground">Top up your sandbox balance instantly.</p>
      </div>
      <Card className="card-glass space-y-5 p-6">
        <div>
          <Label>Currency</Label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`rounded-xl border py-3 text-sm font-semibold transition-all ${currency === c ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}
              >
                {CURRENCY_SYMBOL[c]} {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="amt">Amount</Label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{CURRENCY_SYMBOL[currency]}</span>
            <Input id="amt" inputMode="decimal" className="pl-8 font-display text-xl" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[100, 500, 1000, 5000].map((q) => (
            <Button key={q} variant="outline" size="sm" onClick={() => setAmount(String(q))}>
              {CURRENCY_SYMBOL[currency]}{q}
            </Button>
          ))}
        </div>
        <Button onClick={submit} disabled={amountMinor <= 0 || busy} className="w-full gradient-brand text-white border-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" /> Add {amountMinor > 0 ? formatMoney(amountMinor, currency) : "funds"}</>}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Sandbox deposit — credits your wallet from a virtual funding source. No PIN required for deposits.</p>
      </Card>
    </div>
  );
}
