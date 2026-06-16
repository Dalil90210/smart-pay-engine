import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseIntent, type HiveIntent } from "@/lib/hive-parser";
import { usePayees, type Payee } from "@/hooks/usePayees";
import { useAccounts, useBalances } from "@/hooks/useAccounts";
import { CURRENCIES, CURRENCY_SYMBOL, formatMoney, getFxQuote, getTransferFee, type Currency } from "@/lib/money";
import { ConfirmationCard } from "@/components/ConfirmationCard";
import { PinModal } from "@/components/PinModal";
import { postTransaction } from "@/lib/ledger";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Send, ArrowUp, Loader2 } from "lucide-react";

export const Route = createFileRoute("/hive")({
  head: () => ({ meta: [{ title: "Hive assistant — Smart Pay Engine" }] }),
  component: () => (
    <RequireAuth>
      <HivePage />
    </RequireAuth>
  ),
});

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "hive"; text: string; intent?: HiveIntent; resolvedPayee?: Payee | null; pending?: PendingAction };

type PendingAction = {
  kind: "send" | "convert" | "deposit";
  idempotencyKey: string;
  // pre-computed entries
  meta: Record<string, unknown>;
  entries: { account_id: string; direction: "debit" | "credit"; amount_minor: number }[];
  requiresPin: boolean;
  successMessage: string;
};

const SUGGESTIONS = [
  "Send €500 to Maria",
  "Convert 200 USD to GBP",
  "Add 1000 EUR",
  "What's my balance?",
];

function HivePage() {
  const { data: payees } = usePayees();
  const { data: accounts } = useAccounts();
  const { data: balances } = useBalances();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "hive", text: "Hi — I'm Hive. Tell me what you'd like to do, in your own words. I'll show you a confirmation before anything happens." },
  ]);
  const [input, setInput] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const buildPending = (intent: HiveIntent): { msg: Omit<Message, "id" | "role">; payee?: Payee | null } => {
    if (intent.kind === "send") {
      const matches = (payees ?? []).filter((p) => p.name.toLowerCase().includes(intent.payeeQuery.toLowerCase()));
      const exactCurrency = matches.find((m) => m.currency === intent.currency);
      const payee = exactCurrency ?? matches[0];
      if (!payee) {
        return { msg: { text: `I couldn't find a payee matching "${intent.payeeQuery}". Add them under Send first.`, intent } };
      }
      if (payee.currency !== intent.currency) {
        return { msg: { text: `${payee.name} receives ${payee.currency}, but you asked for ${intent.currency}. Use Convert first or pick a matching payee.`, intent, resolvedPayee: payee } };
      }
      const checking = accounts?.find((a) => a.currency === intent.currency && a.type === "checking");
      const funding = accounts?.find((a) => a.currency === intent.currency && a.type === "funding");
      if (!checking || !funding) return { msg: { text: "Accounts not ready yet, please refresh.", intent } };
      const balance = balances?.find((b) => b.account_id === checking.id)?.balance_minor ?? 0;
      const fee = getTransferFee(intent.amountMinor);
      const total = intent.amountMinor + fee;
      if (total > balance) return { msg: { text: `Not enough ${intent.currency}. You have ${formatMoney(balance, intent.currency)} but need ${formatMoney(total, intent.currency)}.`, intent, resolvedPayee: payee } };
      const pending: PendingAction = {
        kind: "send",
        idempotencyKey: crypto.randomUUID(),
        meta: { description: `Sent to ${payee.name} (via Hive)`, payee_id: payee.id, payee_name: payee.name, amount_minor: intent.amountMinor, fee_minor: fee },
        entries: [
          { account_id: checking.id, direction: "debit", amount_minor: total },
          { account_id: funding.id, direction: "credit", amount_minor: total },
        ],
        requiresPin: true,
        successMessage: `Sent ${formatMoney(intent.amountMinor, intent.currency)} to ${payee.name}.`,
      };
      return { msg: { text: "Here's what I'll do. Confirm to authorize.", intent, resolvedPayee: payee, pending } };
    }
    if (intent.kind === "convert") {
      const fromChk = accounts?.find((a) => a.currency === intent.from && a.type === "checking");
      const toChk = accounts?.find((a) => a.currency === intent.to && a.type === "checking");
      const fromFx = accounts?.find((a) => a.currency === intent.from && a.type === "fx_suspense");
      const toFx = accounts?.find((a) => a.currency === intent.to && a.type === "fx_suspense");
      if (!fromChk || !toChk || !fromFx || !toFx) return { msg: { text: "Accounts not ready yet.", intent } };
      const balance = balances?.find((b) => b.account_id === fromChk.id)?.balance_minor ?? 0;
      if (intent.amountMinor > balance) return { msg: { text: `Not enough ${intent.from}. Available: ${formatMoney(balance, intent.from)}.`, intent } };
      const q = getFxQuote(intent.from, intent.to, intent.amountMinor);
      const pending: PendingAction = {
        kind: "convert",
        idempotencyKey: crypto.randomUUID(),
        meta: { description: `${intent.from} → ${intent.to} (via Hive)`, from_currency: intent.from, to_currency: intent.to, rate: q.rate, from_amount_minor: q.fromMinor, to_amount_minor: q.toMinor, fee_minor: q.feeMinor },
        entries: [
          { account_id: fromChk.id, direction: "debit", amount_minor: q.fromMinor },
          { account_id: fromFx.id, direction: "credit", amount_minor: q.fromMinor },
          { account_id: toFx.id, direction: "debit", amount_minor: q.toMinor },
          { account_id: toChk.id, direction: "credit", amount_minor: q.toMinor },
        ],
        requiresPin: true,
        successMessage: `Converted ${formatMoney(q.fromMinor, intent.from)} → ${formatMoney(q.toMinor, intent.to)}.`,
      };
      return { msg: { text: "Here's the quote. Confirm to convert.", intent, pending } };
    }
    if (intent.kind === "deposit") {
      const chk = accounts?.find((a) => a.currency === intent.currency && a.type === "checking");
      const fnd = accounts?.find((a) => a.currency === intent.currency && a.type === "funding");
      if (!chk || !fnd) return { msg: { text: "Accounts not ready.", intent } };
      const pending: PendingAction = {
        kind: "deposit",
        idempotencyKey: crypto.randomUUID(),
        meta: { description: "Sandbox deposit (via Hive)", amount_minor: intent.amountMinor },
        entries: [
          { account_id: fnd.id, direction: "debit", amount_minor: intent.amountMinor },
          { account_id: chk.id, direction: "credit", amount_minor: intent.amountMinor },
        ],
        requiresPin: false,
        successMessage: `Added ${formatMoney(intent.amountMinor, intent.currency)} to your ${intent.currency} wallet.`,
      };
      return { msg: { text: "Sandbox deposit ready. Confirm to add.", intent, pending } };
    }
    if (intent.kind === "balance") {
      const lines = CURRENCIES.map((c) => {
        const chk = accounts?.find((a) => a.currency === c && a.type === "checking");
        const b = balances?.find((x) => x.account_id === chk?.id)?.balance_minor ?? 0;
        return `• ${c}: ${formatMoney(b, c)}`;
      }).join("\n");
      return { msg: { text: `Your balances:\n${lines}`, intent } };
    }
    return { msg: { text: intent.reason, intent } };
  };

  const onSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text: input.trim() };
    const intent = parseIntent(input);
    const { msg, payee } = buildPending(intent);
    const hiveMsg: Message = { id: crypto.randomUUID(), role: "hive", ...msg, resolvedPayee: msg.resolvedPayee ?? payee };
    setMessages((m) => [...m, userMsg, hiveMsg]);
    setInput("");
  };

  const execute = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg || msg.role !== "hive" || !msg.pending) return;
    const p = msg.pending;
    setBusy(true);
    try {
      await postTransaction({
        idempotencyKey: p.idempotencyKey,
        type: p.kind === "send" ? "transfer" : p.kind === "convert" ? "fx" : "deposit",
        metadata: p.meta,
        entries: p.entries,
      });
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setMessages((all) => [
        ...all.map((m) => (m.id === msgId && m.role === "hive" ? { ...m, pending: undefined } : m)),
        { id: crypto.randomUUID(), role: "hive", text: `✓ ${p.successMessage}` },
      ]);
      toast.success(p.successMessage);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = (msgId: string, requiresPin: boolean) => {
    if (requiresPin) {
      setActiveMsgId(msgId);
      setPinOpen(true);
    } else {
      execute(msgId);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-12rem)] max-w-3xl flex-col md:h-[calc(100vh-8rem)]">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-brand text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Hive</h1>
          <p className="text-xs text-muted-foreground">Plain-language payments. Confirmation always required.</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-border bg-background/40 p-4">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2">
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full gradient-brand text-white">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="max-w-[85%] space-y-3">
                <div className="whitespace-pre-line rounded-2xl rounded-tl-sm bg-card px-4 py-2.5 text-sm">{m.text}</div>
                {m.pending && (
                  <>
                    <IntentPreview msg={m} />
                    <div className="flex gap-2">
                      <Button onClick={() => handleConfirm(m.id, m.pending!.requiresPin)} disabled={busy} className="gradient-brand text-white border-0">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-2 h-3.5 w-3.5" /> Confirm</>}
                      </Button>
                      <Button variant="ghost" onClick={() => setMessages((all) => all.map((x) => x.id === m.id && x.role === "hive" ? { ...x, pending: undefined, text: "Cancelled." } : x))}>
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      {messages.length <= 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => setInput(s)} className="rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs hover:border-primary/40">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSend(); }}
          placeholder='Try "send €500 to Maria"'
          className="h-12"
        />
        <Button onClick={onSend} disabled={!input.trim()} size="icon" className="h-12 w-12 gradient-brand text-white border-0">
          <ArrowUp className="h-5 w-5" />
        </Button>
      </div>

      <PinModal open={pinOpen} onOpenChange={(v) => { setPinOpen(v); if (!v) setActiveMsgId(null); }} onSuccess={() => activeMsgId && execute(activeMsgId)} title="Authorize via Hive" />
    </div>
  );
}

function IntentPreview({ msg }: { msg: Message & { role: "hive" } }) {
  if (!msg.intent || !msg.pending) return null;
  const it = msg.intent;
  if (it.kind === "send" && msg.resolvedPayee) {
    const fee = (msg.pending.meta.fee_minor as number) ?? 0;
    return (
      <ConfirmationCard
        title={`Send to ${msg.resolvedPayee.name}`}
        rows={[
          { label: "Payee", value: msg.resolvedPayee.name },
          { label: "Account", value: msg.resolvedPayee.account_ref },
          { label: "Amount", value: formatMoney(it.amountMinor, it.currency) },
          { label: "Fee", value: formatMoney(fee, it.currency) },
        ]}
        totalLabel="You'll send"
        totalMinor={it.amountMinor + fee}
        totalCurrency={it.currency}
      />
    );
  }
  if (it.kind === "convert") {
    const q = getFxQuote(it.from, it.to, it.amountMinor);
    return (
      <ConfirmationCard
        title={`${it.from} → ${it.to}`}
        rows={[
          { label: "From", value: formatMoney(it.amountMinor, it.from) },
          { label: "Rate", value: `1 ${it.from} = ${q.rate.toFixed(4)} ${it.to}` },
          { label: "Spread fee", value: formatMoney(q.feeMinor, it.to) },
        ]}
        totalLabel="You receive"
        totalMinor={q.toMinor}
        totalCurrency={it.to}
      />
    );
  }
  if (it.kind === "deposit") {
    return (
      <ConfirmationCard
        title="Sandbox deposit"
        rows={[{ label: "Currency", value: `${CURRENCY_SYMBOL[it.currency]} ${it.currency}` }]}
        totalLabel="You'll add"
        totalMinor={it.amountMinor}
        totalCurrency={it.currency}
      />
    );
  }
  return null;
}
