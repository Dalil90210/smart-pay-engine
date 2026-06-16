import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useMemo, useState } from "react";
import { usePayees, type Payee } from "@/hooks/usePayees";
import { useAccounts, useBalances } from "@/hooks/useAccounts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES, CURRENCY_SYMBOL, formatMoney, getTransferFee, toMinor, type Currency } from "@/lib/money";
import { ConfirmationCard } from "@/components/ConfirmationCard";
import { PinModal } from "@/components/PinModal";
import { postTransaction, type IdempotencyAuditResult } from "@/lib/ledger";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, ArrowLeft, Loader2 } from "lucide-react";
import { IdempotencyIndicator, type IdempotencyStatus } from "@/components/IdempotencyIndicator";
import { IdempotencyAudit } from "@/components/IdempotencyAudit";
import { IdempotencyAuditHistory } from "@/components/IdempotencyAuditHistory";
import { useIdempotencyAuditHistory } from "@/hooks/useIdempotencyAuditHistory";

export const Route = createFileRoute("/send")({
  head: () => ({
    meta: [{ title: "Send money — Smart Pay Engine" }],
  }),
  component: () => (
    <RequireAuth>
      <SendPage />
    </RequireAuth>
  ),
});

type Step = "form" | "review";

function SendPage() {
  const { data: payees } = usePayees();
  const { data: accounts } = useAccounts();
  const { data: balances } = useBalances();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("form");
  const [payeeId, setPayeeId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [idemStatus, setIdemStatus] = useState<IdempotencyStatus>("ready");
  const [audit, setAudit] = useState<IdempotencyAuditResult | null>(null);
  const { history, runCheck, clear: clearHistory } = useIdempotencyAuditHistory();
  const [pinOpen, setPinOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const payee = payees?.find((p) => p.id === payeeId);
  const currency = (payee?.currency ?? "USD") as Currency;
  const amountMinor = toMinor(amount || 0);
  const feeMinor = amountMinor > 0 ? getTransferFee(amountMinor) : 0;
  const totalMinor = amountMinor + feeMinor;

  const checking = accounts?.find((a) => a.currency === currency && a.type === "checking");
  const funding = accounts?.find((a) => a.currency === currency && a.type === "funding");
  const balance = balances?.find((b) => b.account_id === checking?.id)?.balance_minor ?? 0;
  const insufficient = totalMinor > balance;

  const handleExecute = async () => {
    if (!payee || !checking || !funding) return;
    setSubmitting(true);
    setIdemStatus("submitting");
    try {
      const result = await runCheck(idempotencyKey);
      setAudit(result);
      if (result.used) {
        setIdemStatus("duplicate");
        toast.error("Duplicate request blocked — this transfer was already submitted.");
        return;
      }
      await postTransaction({
        idempotencyKey,
        type: "transfer",
        metadata: {
          description: `Sent to ${payee.name}`,
          payee_id: payee.id,
          payee_name: payee.name,
          payee_ref: payee.account_ref,
          amount_minor: amountMinor,
          fee_minor: feeMinor,
          note,
        },
        entries: [
          { account_id: checking.id, direction: "debit", amount_minor: totalMinor },
          // outbound transfer: credit funding account to represent money leaving the wallet
          { account_id: funding.id, direction: "credit", amount_minor: totalMinor },
        ],
      });
      setIdemStatus("posted");
      toast.success(`Sent ${formatMoney(amountMinor, currency)} to ${payee.name}`);
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      navigate({ to: "/transactions" });
    } catch (e) {
      setIdemStatus("ready");
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        {step === "review" && (
          <Button variant="ghost" size="icon" onClick={() => setStep("form")}><ArrowLeft className="h-4 w-4" /></Button>
        )}
        <h1 className="font-display text-2xl font-bold">Send money</h1>
      </div>

      {step === "form" && (
        <Card className="card-glass space-y-5 p-6">
          <div>
            <Label>Payee</Label>
            <PayeePicker payees={payees ?? []} value={payeeId} onChange={setPayeeId} />
          </div>
          {payee && (
            <>
              <div>
                <Label htmlFor="amt">Amount ({currency})</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{CURRENCY_SYMBOL[currency]}</span>
                  <Input id="amt" inputMode="decimal" className="pl-8 font-display text-xl" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Available: {formatMoney(balance, currency)}
                </p>
              </div>
              <div>
                <Label htmlFor="note">Note (optional)</Label>
                <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's this for?" maxLength={120} />
              </div>
              {amountMinor > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span>{formatMoney(amountMinor, currency)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span>{formatMoney(feeMinor, currency)}</span></div>
                  <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold"><span>Total</span><span>{formatMoney(totalMinor, currency)}</span></div>
                </div>
              )}
              <Button
                onClick={() => setStep("review")}
                disabled={!payee || amountMinor <= 0 || insufficient}
                className="w-full gradient-brand text-white border-0"
              >
                {insufficient ? "Insufficient balance" : "Review"}
              </Button>
            </>
          )}
        </Card>
      )}

      {step === "review" && payee && (
        <div className="space-y-4">
          <ConfirmationCard
            title={`Send to ${payee.name}`}
            rows={[
              { label: "Payee", value: payee.name },
              { label: "Account", value: payee.account_ref },
              { label: "Amount", value: formatMoney(amountMinor, currency) },
              { label: "Fee", value: formatMoney(feeMinor, currency) },
              ...(note ? [{ label: "Note", value: note }] : []),
            ]}
            totalLabel="You'll send"
            totalMinor={totalMinor}
            totalCurrency={currency}
          />
          <IdempotencyIndicator idempotencyKey={idempotencyKey} status={idemStatus} />
          <IdempotencyAudit audit={audit} />
          <Button
            onClick={() => setPinOpen(true)}
            disabled={submitting || idemStatus === "duplicate" || idemStatus === "posted"}
            className="w-full gradient-brand text-white border-0 h-12 text-base"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-2 h-4 w-4" /> Confirm & send</>}
          </Button>
          <p className="text-center text-xs text-muted-foreground">Sandbox — no real money will be moved.</p>
        </div>
      )}

      <PinModal open={pinOpen} onOpenChange={setPinOpen} onSuccess={handleExecute} title="Authorize transfer" description="Enter your 4-digit PIN to send this payment." />
    </div>
  );
}

function PayeePicker({ payees, value, onChange }: { payees: Payee[]; value: string; onChange: (v: string) => void }) {
  const grouped = useMemo(() => {
    return CURRENCIES.map((c) => ({ currency: c, items: payees.filter((p) => p.currency === c) }));
  }, [payees]);

  return (
    <div className="mt-2 space-y-3">
      {grouped.map((g) =>
        g.items.length ? (
          <div key={g.currency}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.currency}</div>
            <div className="grid gap-2">
              {g.items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange(p.id)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${value === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full gradient-brand text-xs font-bold text-white">
                    {p.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{p.account_ref}</div>
                  </div>
                  <div className="text-xs font-semibold text-muted-foreground">{p.currency}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
}
