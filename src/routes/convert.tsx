import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useState } from "react";
import { useAccounts, useBalances } from "@/hooks/useAccounts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES, CURRENCY_SYMBOL, formatMoney, getFxQuote, toMinor, type Currency } from "@/lib/money";
import { ConfirmationCard } from "@/components/ConfirmationCard";
import { PinModal } from "@/components/PinModal";
import { postTransaction } from "@/lib/ledger";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowRightLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/convert")({
  head: () => ({ meta: [{ title: "Convert currency — Smart Pay Engine" }] }),
  component: () => (
    <RequireAuth>
      <ConvertPage />
    </RequireAuth>
  ),
});

function ConvertPage() {
  const { data: accounts } = useAccounts();
  const { data: balances } = useBalances();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [from, setFrom] = useState<Currency>("USD");
  const [to, setTo] = useState<Currency>("EUR");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"form" | "review">("form");
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [pinOpen, setPinOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const amountMinor = toMinor(amount || 0);
  const quote = getFxQuote(from, to, amountMinor);

  const fromChecking = accounts?.find((a) => a.currency === from && a.type === "checking");
  const toChecking = accounts?.find((a) => a.currency === to && a.type === "checking");
  const fromFx = accounts?.find((a) => a.currency === from && a.type === "fx_suspense");
  const toFx = accounts?.find((a) => a.currency === to && a.type === "fx_suspense");

  const fromBalance = balances?.find((b) => b.account_id === fromChecking?.id)?.balance_minor ?? 0;
  const insufficient = amountMinor > fromBalance;

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const execute = async () => {
    if (!fromChecking || !toChecking || !fromFx || !toFx) return;
    setBusy(true);
    try {
      await postTransaction({
        idempotencyKey,
        type: "fx",
        metadata: {
          description: `${from} → ${to}`,
          from_currency: from,
          to_currency: to,
          rate: quote.rate,
          mid_rate: quote.mid,
          spread: quote.spread,
          from_amount_minor: quote.fromMinor,
          to_amount_minor: quote.toMinor,
          fee_minor: quote.feeMinor,
        },
        entries: [
          // Source leg: debit user checking, credit FX suspense source ccy
          { account_id: fromChecking.id, direction: "debit", amount_minor: quote.fromMinor },
          { account_id: fromFx.id, direction: "credit", amount_minor: quote.fromMinor },
          // Target leg: debit FX suspense target ccy, credit user checking
          { account_id: toFx.id, direction: "debit", amount_minor: quote.toMinor },
          { account_id: toChecking.id, direction: "credit", amount_minor: quote.toMinor },
        ],
      });
      toast.success(`Converted ${formatMoney(quote.fromMinor, from)} → ${formatMoney(quote.toMinor, to)}`);
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
      <div className="flex items-center gap-3">
        {step === "review" && (
          <Button variant="ghost" size="icon" onClick={() => setStep("form")}><ArrowLeft className="h-4 w-4" /></Button>
        )}
        <div>
          <h1 className="font-display text-2xl font-bold">Convert currency</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live sandbox FX with a small spread.</p>
        </div>
      </div>

      {step === "form" && (
        <Card className="card-glass space-y-4 p-6">
          <CurrencySelectRow label="From" value={from} onChange={setFrom} />
          <div>
            <Label htmlFor="amt">Amount</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{CURRENCY_SYMBOL[from]}</span>
              <Input id="amt" inputMode="decimal" className="pl-8 font-display text-xl" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Available: {formatMoney(fromBalance, from)}</p>
          </div>
          <div className="flex justify-center">
            <Button variant="outline" size="icon" onClick={swap} className="rounded-full"><ArrowDown className="h-4 w-4" /></Button>
          </div>
          <CurrencySelectRow label="To" value={to} onChange={setTo} exclude={from} />
          {amountMinor > 0 && from !== to && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span>1 {from} = {quote.rate.toFixed(4)} {to}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Spread (0.5%)</span><span>{formatMoney(quote.feeMinor, to)}</span></div>
              <div className="mt-1 flex justify-between border-t border-border pt-2 font-semibold"><span>You receive</span><span>{formatMoney(quote.toMinor, to)}</span></div>
            </div>
          )}
          <Button
            className="w-full gradient-brand text-white border-0"
            disabled={amountMinor <= 0 || from === to || insufficient}
            onClick={() => { setIdempotencyKey(crypto.randomUUID()); setStep("review"); }}
          >
            {from === to ? "Pick different currencies" : insufficient ? "Insufficient balance" : "Review"}
          </Button>
        </Card>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <ConfirmationCard
            title={`${from} → ${to}`}
            rows={[
              { label: "From", value: formatMoney(quote.fromMinor, from) },
              { label: "Rate", value: `1 ${from} = ${quote.rate.toFixed(4)} ${to}` },
              { label: "Spread fee", value: formatMoney(quote.feeMinor, to) },
            ]}
            totalLabel="You receive"
            totalMinor={quote.toMinor}
            totalCurrency={to}
          />
          <Button onClick={() => setPinOpen(true)} disabled={busy} className="w-full gradient-brand text-white border-0 h-12 text-base">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ArrowRightLeft className="mr-2 h-4 w-4" /> Confirm & convert</>}
          </Button>
        </div>
      )}

      <PinModal open={pinOpen} onOpenChange={setPinOpen} onSuccess={execute} title="Authorize conversion" />
    </div>
  );
}

function CurrencySelectRow({ label, value, onChange, exclude }: { label: string; value: Currency; onChange: (v: Currency) => void; exclude?: Currency }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {CURRENCIES.map((c) => (
          <button
            key={c}
            disabled={c === exclude}
            onClick={() => onChange(c)}
            className={`rounded-xl border py-2.5 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${value === c ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}
          >
            {CURRENCY_SYMBOL[c]} {c}
          </button>
        ))}
      </div>
    </div>
  );
}
