import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { usePayees, type Payee } from "@/hooks/usePayees";
import { useAccounts, useBalances } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { useQueryClient } from "@tanstack/react-query";
import {
  formatMoney,
  toMinor,
  getTransferFee,
  getFxQuote,
  CURRENCIES,
  type Currency,
} from "@/lib/money";
import { postTransaction, postFxConversion } from "@/lib/ledger";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmationCard } from "@/components/ConfirmationCard";
import { PinModal } from "@/components/PinModal";
import { toast } from "sonner";
import {
  Loader2,
  Send,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const search = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/assistant/$threadId")({
  validateSearch: search,
  component: HivePage,
});

// ---------- Intent schema (client-side validation of the parser output) ----------

const IntentSchema = z.object({
  intent: z.enum([
    "send_money",
    "check_balance",
    "convert_currency",
    "create_invoice",
    "explain_fees",
    "list_transactions",
    "unknown",
  ]),
  amount_minor: z.number().int().nonnegative().nullable().optional(),
  currency: z.enum(["USD", "EUR", "GBP"]).nullable().optional(),
  to_currency: z.enum(["USD", "EUR", "GBP"]).nullable().optional(),
  payee_query: z.string().max(120).nullable().optional(),
  invoice: z
    .object({
      client_name: z.string().max(120).optional().nullable(),
      client_email: z.string().max(200).optional().nullable(),
      description: z.string().max(500).optional().nullable(),
      due_in_days: z.number().int().min(0).max(365).optional().nullable(),
    })
    .nullable()
    .optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  clarification: z.string().max(400).nullable().optional(),
});
type Intent = z.infer<typeof IntentSchema>;

// ---------- Message model ----------

type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; kind: "text"; text: string }
  | { id: string; role: "assistant"; kind: "balances"; balances: { currency: Currency; balance_minor: number }[] }
  | { id: string; role: "assistant"; kind: "transactions"; rows: Array<{ id: string; type: string; state: string; created_at: string; description: string; currency: Currency; amount_minor: number }> }
  | { id: string; role: "assistant"; kind: "confirm_send"; logId: string; payee: Payee; amountMinor: number; feeMinor: number; note: string | null; done?: { txId: string } | { error: string } }
  | { id: string; role: "assistant"; kind: "confirm_fx"; logId: string; from: Currency; to: Currency; fromAmountMinor: number; toAmountMinor: number; feeMinor: number; rate: number; done?: { txId: string; toAmountMinor: number } | { error: string } }
  | { id: string; role: "assistant"; kind: "invoice_draft"; clientName: string; clientEmail: string | null; amountMinor: number; currency: Currency; description: string; dueInDays: number; done?: { invoiceId: string } | { error: string } };

// ---------- Root component ----------

function HivePage() {
  const { threadId } = Route.useParams();
  const { q } = Route.useSearch();
  const { data: payees = [] } = usePayees();
  const { data: accounts = [] } = useAccounts();
  const { data: balances = [] } = useBalances();
  const { data: recentTx = [] } = useTransactions(20);
  const qc = useQueryClient();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sentAuto = useRef(false);
  const persistedIds = useRef<Set<string>>(new Set());
  const titleSet = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, parsing]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, parsing]);

  // Load persisted conversation whenever the thread changes.
  useEffect(() => {
    let cancelled = false;
    persistedIds.current = new Set();
    titleSet.current = false;
    setMessages([]);
    sentAuto.current = false;
    (async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("message, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (cancelled || error || !data) return;
      const loaded = data
        .map((r) => r.message as unknown as Msg)
        .filter((m): m is Msg => !!m && typeof m === "object" && "id" in m && "role" in m);
      for (const m of loaded) persistedIds.current.add(m.id);
      if (loaded.some((m) => m.role === "user")) titleSet.current = true;
      setMessages(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const persistMsg = async (m: Msg) => {
    if (persistedIds.current.has(m.id)) return;
    persistedIds.current.add(m.id);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      await supabase.from("chat_messages").insert({
        thread_id: threadId,
        user_id: u.user.id,
        role: m.role,
        message: m as unknown as never,
      });
      // Set thread title from first user message
      if (m.role === "user" && !titleSet.current) {
        titleSet.current = true;
        const title = m.text.slice(0, 60);
        await supabase
          .from("chat_threads")
          .update({ title, updated_at: new Date().toISOString() })
          .eq("id", threadId)
          .eq("title", "New conversation");
        qc.invalidateQueries({ queryKey: ["threads"] });
      } else {
        await supabase
          .from("chat_threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", threadId);
      }
    } catch {
      /* persistence is best-effort */
    }
  };

  const updatePersisted = async (m: Msg) => {
    try {
      await supabase
        .from("chat_messages")
        .update({ message: m as unknown as never })
        .eq("thread_id", threadId)
        .eq("message->>id", m.id);
    } catch {
      /* best-effort */
    }
  };

  const append = (m: Msg) => {
    setMessages((prev) => [...prev, m]);
    void persistMsg(m);
  };
  const updateMsg = (id: string, patch: Partial<Msg>) =>
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === id ? ({ ...m, ...patch } as Msg) : m));
      const updated = next.find((m) => m.id === id);
      if (updated) void updatePersisted(updated);
      return next;
    });

  const handleSend = async (raw: string) => {
    const text = raw.trim();
    if (!text || parsing) return;
    setInput("");
    const userId = crypto.randomUUID();
    append({ id: userId, role: "user", text });
    setParsing(true);

    // 1) call the edge function (parser only)
    let parsedIntent: Intent | null = null;
    let parseError: string | null = null;
    try {
      const { data, error } = await supabase.functions.invoke("hive-parse", {
        body: {
          message: text,
          payees: payees.map((p) => ({ name: p.name, currency: p.currency })),
        },
      });
      if (error) throw error;
      const validated = IntentSchema.safeParse(data);
      if (!validated.success) {
        parseError = "Parser returned unexpected shape.";
      } else {
        parsedIntent = validated.data;
      }
    } catch (e) {
      parseError = (e as Error).message || "Parser failed";
    }

    // 2) write the log row (best-effort)
    let logId = "";
    try {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: log } = await supabase
          .from("hive_logs")
          .insert({
            user_id: u.user.id,
            thread_id: threadId,
            user_message: text,
            parsed_intent: (parsedIntent as unknown as never) ?? null,
            error: parseError,
          })
          .select("id")
          .single();
        logId = log?.id ?? "";
      }
    } catch { /* logging is best-effort */ }

    setParsing(false);

    if (parseError || !parsedIntent) {
      append({
        id: crypto.randomUUID(),
        role: "assistant",
        kind: "text",
        text: parseError ?? "I couldn't parse that. Try rephrasing.",
      });
      return;
    }

    // 3) route the intent (with server-side re-validation)
    await routeIntent(parsedIntent, logId);
  };

  const routeIntent = async (intent: Intent, logId: string) => {
    // Low confidence or explicit clarification → ask, don't act
    if (intent.clarification && (intent.confidence < 0.6 || intent.intent === "unknown")) {
      append({ id: crypto.randomUUID(), role: "assistant", kind: "text", text: intent.clarification });
      return;
    }

    if (intent.intent === "unknown") {
      append({
        id: crypto.randomUUID(),
        role: "assistant",
        kind: "text",
        text: intent.clarification ?? "I can send money, check balances, convert currency, list transactions, explain fees, or draft an invoice. What would you like to do?",
      });
      return;
    }

    if (intent.intent === "check_balance") {
      const grouped = CURRENCIES.map((c) => {
        const acc = accounts.find((a) => a.currency === c && a.type === "checking");
        const bal = balances.find((b) => b.account_id === acc?.id)?.balance_minor ?? 0;
        return { currency: c, balance_minor: bal };
      });
      append({ id: crypto.randomUUID(), role: "assistant", kind: "balances", balances: grouped });
      return;
    }

    if (intent.intent === "list_transactions") {
      const rows = recentTx.slice(0, 10).map((t) => {
        const primary = t.ledger_entries?.[0];
        const meta = (t.metadata ?? {}) as { description?: string };
        return {
          id: t.id,
          type: t.type,
          state: t.state,
          created_at: t.created_at,
          description: meta.description ?? t.type,
          currency: (primary?.currency ?? "USD") as Currency,
          amount_minor: primary?.amount_minor ?? 0,
        };
      });
      append({ id: crypto.randomUUID(), role: "assistant", kind: "transactions", rows });
      return;
    }

    if (intent.intent === "explain_fees") {
      const ccy = (intent.currency ?? "USD") as Currency;
      const sample = intent.amount_minor && intent.amount_minor > 0 ? intent.amount_minor : 50000;
      const fee = getTransferFee(sample);
      const fx = intent.to_currency && intent.to_currency !== ccy
        ? getFxQuote(ccy, intent.to_currency as Currency, sample)
        : null;
      const parts = [
        `Transfers in this sandbox charge **0.5% + ${formatMoney(25, ccy)}** on the amount.`,
        `For ${formatMoney(sample, ccy)}, that's ${formatMoney(fee, ccy)}.`,
      ];
      if (fx) {
        parts.push(
          `FX ${ccy}→${fx ? intent.to_currency : ""} uses a mid-market rate with a **0.5% spread** baked into the effective rate — so no separate fee line, just a slightly worse rate than mid.`,
        );
      } else {
        parts.push("Currency conversions use a 0.5% spread against a mid-market rate — no separate fee line.");
      }
      append({ id: crypto.randomUUID(), role: "assistant", kind: "text", text: parts.join("\n\n") });
      return;
    }

    if (intent.intent === "send_money") {
      // Resolve payee server-side (via our payee list, which is user-scoped).
      const amountMinor = intent.amount_minor ?? 0;
      const query = (intent.payee_query ?? "").trim().toLowerCase();
      const matches = payees.filter((p) => query && p.name.toLowerCase().includes(query));
      const currency = intent.currency as Currency | null;

      if (!query) {
        append({ id: crypto.randomUUID(), role: "assistant", kind: "text", text: "Who should I send this to?" });
        return;
      }
      if (matches.length === 0) {
        append({
          id: crypto.randomUUID(),
          role: "assistant",
          kind: "text",
          text: `I don't have a saved payee matching "${intent.payee_query}". Add them under Payees first.`,
        });
        return;
      }
      let payee = matches[0];
      if (matches.length > 1) {
        // Narrow by currency if provided
        const narrowed = currency ? matches.filter((p) => p.currency === currency) : matches;
        if (narrowed.length !== 1) {
          append({
            id: crypto.randomUUID(),
            role: "assistant",
            kind: "text",
            text: `Which one did you mean? ${matches.map((m) => `${m.name} (${m.currency})`).join(", ")}.`,
          });
          return;
        }
        payee = narrowed[0];
      }
      if (currency && currency !== payee.currency) {
        append({
          id: crypto.randomUUID(),
          role: "assistant",
          kind: "text",
          text: `${payee.name} is a ${payee.currency} payee — I can't send them ${currency} directly. Convert first, or pick a different payee.`,
        });
        return;
      }
      if (amountMinor <= 0) {
        append({ id: crypto.randomUUID(), role: "assistant", kind: "text", text: `How much should I send ${payee.name}?` });
        return;
      }
      const feeMinor = getTransferFee(amountMinor); // recomputed server-side — never trust the model
      append({
        id: crypto.randomUUID(),
        role: "assistant",
        kind: "confirm_send",
        logId,
        payee,
        amountMinor,
        feeMinor,
        note: null,
      });
      return;
    }

    if (intent.intent === "convert_currency") {
      const from = intent.currency as Currency | null;
      const to = intent.to_currency as Currency | null;
      const amt = intent.amount_minor ?? 0;
      if (!from || !to || from === to) {
        append({ id: crypto.randomUUID(), role: "assistant", kind: "text", text: "Which currencies should I convert between?" });
        return;
      }
      if (amt <= 0) {
        append({ id: crypto.randomUUID(), role: "assistant", kind: "text", text: `How much ${from} should I convert?` });
        return;
      }
      const quote = getFxQuote(from, to, amt); // recomputed locally; server also reprices at execution
      append({
        id: crypto.randomUUID(),
        role: "assistant",
        kind: "confirm_fx",
        logId,
        from,
        to,
        fromAmountMinor: amt,
        toAmountMinor: quote.toMinor,
        feeMinor: quote.feeMinor,
        rate: quote.rate,
      });
      return;
    }

    if (intent.intent === "create_invoice") {
      const inv = intent.invoice ?? {};
      const clientName = (inv.client_name ?? "").trim();
      const currency = (intent.currency ?? "USD") as Currency;
      const amountMinor = intent.amount_minor ?? 0;
      if (!clientName) {
        append({ id: crypto.randomUUID(), role: "assistant", kind: "text", text: "Who's the invoice for?" });
        return;
      }
      if (amountMinor <= 0) {
        append({ id: crypto.randomUUID(), role: "assistant", kind: "text", text: `What amount should the ${clientName} invoice be for?` });
        return;
      }
      append({
        id: crypto.randomUUID(),
        role: "assistant",
        kind: "invoice_draft",
        clientName,
        clientEmail: inv.client_email ?? null,
        amountMinor,
        currency,
        description: inv.description ?? "Services rendered",
        dueInDays: inv.due_in_days ?? 14,
      });
      return;
    }
  };

  // ---------- Confirmation executors ----------

  const executeSend = async (msg: Extract<Msg, { kind: "confirm_send" }>, pin: string) => {
    try {
      const checking = accounts.find((a) => a.currency === msg.payee.currency && a.type === "checking");
      const funding = accounts.find((a) => a.currency === msg.payee.currency && a.type === "funding");
      if (!checking || !funding) throw new Error("Wallet not provisioned");
      const total = msg.amountMinor + msg.feeMinor;
      const txId = await postTransaction({
        idempotencyKey: `hive:${msg.logId || crypto.randomUUID()}`,
        type: "transfer",
        metadata: {
          description: `Sent to ${msg.payee.name} (via Hive)`,
          payee_id: msg.payee.id,
          payee_name: msg.payee.name,
          payee_ref: msg.payee.account_ref,
          amount_minor: msg.amountMinor,
          fee_minor: msg.feeMinor,
          via: "hive",
        },
        entries: [
          { account_id: checking.id, direction: "debit", amount_minor: total },
          { account_id: funding.id, direction: "credit", amount_minor: total },
        ],
        pin,
      });
      updateMsg(msg.id, { done: { txId } } as Partial<Msg>);
      if (msg.logId) {
        await supabase
          .from("hive_logs")
          .update({ confirmed: true, result: { transaction_id: txId } })
          .eq("id", msg.logId);
      }
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(`Sent ${formatMoney(msg.amountMinor, msg.payee.currency)} to ${msg.payee.name}`);
    } catch (e) {
      const err = (e as Error).message;
      updateMsg(msg.id, { done: { error: err } } as Partial<Msg>);
      toast.error(err);
    }
  };

  const executeFx = async (msg: Extract<Msg, { kind: "confirm_fx" }>, pin: string) => {
    try {
      const result = await postFxConversion({
        idempotencyKey: `hive:${msg.logId || crypto.randomUUID()}`,
        fromCurrency: msg.from,
        toCurrency: msg.to,
        fromAmountMinor: msg.fromAmountMinor,
        pin,
      });
      updateMsg(msg.id, { done: { txId: result.transaction_id, toAmountMinor: result.to_amount_minor } } as Partial<Msg>);
      if (msg.logId) {
        await supabase.from("hive_logs").update({ confirmed: true, result: result as unknown as never }).eq("id", msg.logId);
      }
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(`Converted ${formatMoney(msg.fromAmountMinor, msg.from)} → ${formatMoney(result.to_amount_minor, msg.to)}`);
    } catch (e) {
      const err = (e as Error).message;
      updateMsg(msg.id, { done: { error: err } } as Partial<Msg>);
      toast.error(err);
    }
  };

  const executeInvoice = async (msg: Extract<Msg, { kind: "invoice_draft" }>) => {
    try {
      const due = new Date();
      due.setDate(due.getDate() + msg.dueInDays);
      const { data, error } = await supabase.rpc("create_invoice", {
        p_client_name: msg.clientName,
        p_client_email: msg.clientEmail ?? "",
        p_currency: msg.currency,
        p_due_date: due.toISOString().slice(0, 10),
        p_items: [{ description: msg.description, quantity: 1, unit_price_minor: msg.amountMinor }] as never,
        p_tax_setaside_percent: null as never,
        p_notes: null as never,
        p_send: false,
      });
      if (error) throw error;
      const invoiceId = data as unknown as string;
      updateMsg(msg.id, { done: { invoiceId } } as Partial<Msg>);
      toast.success("Draft invoice created");
    } catch (e) {
      const err = (e as Error).message;
      updateMsg(msg.id, { done: { error: err } } as Partial<Msg>);
      toast.error(err);
    }
  };

  // ---------- Auto-send ?q= ----------
  useEffect(() => {
    if (q && !sentAuto.current && messages.length === 0) {
      sentAuto.current = true;
      handleSend(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-gradient-to-r from-primary/10 via-cyan/5 to-transparent px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl gradient-brand shadow-lg shadow-cyan/20">
            <Sparkles className="h-5 w-5 text-white" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-success" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-sm font-semibold tracking-tight sm:text-base">
                Hive · Smart Pay Engine
              </h1>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-500">
                Sandbox
              </span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              Parses what you say, confirms before it moves a cent.
            </p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-8">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md space-y-4 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl gradient-brand shadow-xl shadow-primary/30">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold">Talk money.</h2>
              <p className="text-xs text-muted-foreground">
                Try "send 500 euros to Maria", "what's my balance", or "convert 200 quid to dollars".
                I'll always show you a confirmation card before anything moves.
              </p>
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <UserBubble key={m.id} text={m.text} />
          ) : (
            <AssistantBubble
              key={m.id}
              msg={m}
              onExecuteSend={executeSend}
              onExecuteFx={executeFx}
              onExecuteInvoice={executeInvoice}
            />
          ),
        )}
        {parsing && (
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-cyan" />
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-cyan [animation-delay:120ms]" />
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-cyan [animation-delay:240ms]" />
            <span className="ml-1">Hive is thinking…</span>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
        className="border-t border-border bg-card/40 px-4 py-3 sm:px-8"
      >
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send €500 to Maria · What's my balance? · Convert 200 quid to USD"
            rows={1}
            className="min-h-[44px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            disabled={parsing}
          />
          <Button type="submit" size="icon" disabled={parsing || !input.trim()} className="shadow-md shadow-primary/20">
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          Sandbox · Hive parses your request. Nothing moves until you confirm + enter your PIN.
        </div>
      </form>
    </div>
  );
}

// ---------- Bubbles ----------

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        {text}
      </div>
    </div>
  );
}

function AssistantShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        <div className="flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3 w-3 text-cyan" /> Hive
        </div>
        {children}
      </div>
    </div>
  );
}

function AssistantBubble({
  msg,
  onExecuteSend,
  onExecuteFx,
  onExecuteInvoice,
}: {
  msg: Extract<Msg, { role: "assistant" }>;
  onExecuteSend: (m: Extract<Msg, { kind: "confirm_send" }>, pin: string) => Promise<void>;
  onExecuteFx: (m: Extract<Msg, { kind: "confirm_fx" }>, pin: string) => Promise<void>;
  onExecuteInvoice: (m: Extract<Msg, { kind: "invoice_draft" }>) => Promise<void>;
}) {
  if (msg.kind === "text") {
    return (
      <AssistantShell>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{msg.text}</div>
      </AssistantShell>
    );
  }
  if (msg.kind === "balances") {
    return (
      <AssistantShell>
        <Card className="card-glass grid grid-cols-3 gap-3 p-4">
          {msg.balances.map((b) => (
            <div key={b.currency} className="rounded-lg border border-border/60 bg-background/60 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{b.currency}</div>
              <div className="mt-1 font-display text-lg font-bold">{formatMoney(b.balance_minor, b.currency)}</div>
            </div>
          ))}
        </Card>
      </AssistantShell>
    );
  }
  if (msg.kind === "transactions") {
    return (
      <AssistantShell>
        <Card className="card-glass overflow-hidden p-0">
          <div className="border-b border-border px-4 py-2 text-xs font-medium">Recent transactions</div>
          {msg.rows.length === 0 && <div className="p-4 text-xs text-muted-foreground">No transactions yet.</div>}
          <ul className="divide-y divide-border">
            {msg.rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.description}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {r.type} · {r.state} · {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="font-semibold">{formatMoney(r.amount_minor, r.currency)}</div>
              </li>
            ))}
          </ul>
        </Card>
      </AssistantShell>
    );
  }
  if (msg.kind === "confirm_send") return <ConfirmSend msg={msg} onExecute={onExecuteSend} />;
  if (msg.kind === "confirm_fx") return <ConfirmFx msg={msg} onExecute={onExecuteFx} />;
  if (msg.kind === "invoice_draft") return <InvoiceDraft msg={msg} onExecute={onExecuteInvoice} />;
  return null;
}

function ConfirmSend({
  msg,
  onExecute,
}: {
  msg: Extract<Msg, { kind: "confirm_send" }>;
  onExecute: (m: Extract<Msg, { kind: "confirm_send" }>, pin: string) => Promise<void>;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  const total = msg.amountMinor + msg.feeMinor;
  const done = msg.done;
  return (
    <AssistantShell>
      <ConfirmationCard
        title={`Send to ${msg.payee.name}`}
        rows={[
          { label: "Payee", value: msg.payee.name },
          { label: "Account", value: msg.payee.account_ref },
          { label: "Amount", value: formatMoney(msg.amountMinor, msg.payee.currency) },
          { label: "Fee", value: formatMoney(msg.feeMinor, msg.payee.currency) },
        ]}
        totalLabel="You'll send"
        totalMinor={total}
        totalCurrency={msg.payee.currency}
      />
      {!done && (
        <Button onClick={() => setPinOpen(true)} className="w-full gradient-brand text-white border-0">
          <ShieldCheck className="mr-2 h-4 w-4" /> Confirm & enter PIN
        </Button>
      )}
      {done && "txId" in done && <ReceiptBanner text={`Sent ${formatMoney(msg.amountMinor, msg.payee.currency)} to ${msg.payee.name}`} />}
      {done && "error" in done && <ErrorBanner text={done.error} />}
      <PinModal
        open={pinOpen}
        onOpenChange={setPinOpen}
        onSuccess={(pin) => onExecute(msg, pin)}
        title="Authorize transfer"
        description="Enter your 4-digit PIN to send this payment."
      />
    </AssistantShell>
  );
}

function ConfirmFx({
  msg,
  onExecute,
}: {
  msg: Extract<Msg, { kind: "confirm_fx" }>;
  onExecute: (m: Extract<Msg, { kind: "confirm_fx" }>, pin: string) => Promise<void>;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  const done = msg.done;
  return (
    <AssistantShell>
      <ConfirmationCard
        title={`Convert ${msg.from} → ${msg.to}`}
        rows={[
          { label: "From", value: formatMoney(msg.fromAmountMinor, msg.from) },
          { label: "Effective rate", value: msg.rate.toFixed(4) },
          { label: "Spread (0.5%)", value: formatMoney(msg.feeMinor, msg.to) },
          { label: "You get", value: formatMoney(msg.toAmountMinor, msg.to) },
        ]}
        totalLabel={`You'll receive`}
        totalMinor={msg.toAmountMinor}
        totalCurrency={msg.to}
      />
      {!done && (
        <Button onClick={() => setPinOpen(true)} className="w-full gradient-brand text-white border-0">
          <ShieldCheck className="mr-2 h-4 w-4" /> Confirm & enter PIN
        </Button>
      )}
      {done && "txId" in done && <ReceiptBanner text={`Converted ${formatMoney(msg.fromAmountMinor, msg.from)} → ${formatMoney(done.toAmountMinor, msg.to)}`} />}
      {done && "error" in done && <ErrorBanner text={done.error} />}
      <PinModal
        open={pinOpen}
        onOpenChange={setPinOpen}
        onSuccess={(pin) => onExecute(msg, pin)}
        title="Authorize conversion"
        description="Enter your 4-digit PIN to run this FX conversion."
      />
    </AssistantShell>
  );
}

function InvoiceDraft({
  msg,
  onExecute,
}: {
  msg: Extract<Msg, { kind: "invoice_draft" }>;
  onExecute: (m: Extract<Msg, { kind: "invoice_draft" }>) => Promise<void>;
}) {
  const [email, setEmail] = useState(msg.clientEmail ?? "");
  const [desc, setDesc] = useState(msg.description);
  const done = msg.done;
  return (
    <AssistantShell>
      <Card className="card-glass space-y-3 p-4">
        <div className="font-display text-sm font-semibold">Draft invoice · {msg.clientName}</div>
        <div className="grid gap-2 text-xs">
          <div>
            <Label className="text-[10px]">Client email (optional)</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
          </div>
          <div>
            <Label className="text-[10px]">Description</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="flex justify-between rounded-md bg-muted/40 px-3 py-2">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold">{formatMoney(msg.amountMinor, msg.currency)}</span>
          </div>
          <div className="flex justify-between rounded-md bg-muted/40 px-3 py-2">
            <span className="text-muted-foreground">Due in</span>
            <span>{msg.dueInDays} days</span>
          </div>
        </div>
        {!done && (
          <Button
            onClick={() => onExecute({ ...msg, clientEmail: email || null, description: desc })}
            className="w-full gradient-brand text-white border-0"
          >
            Save as draft invoice
          </Button>
        )}
        {done && "invoiceId" in done && <ReceiptBanner text="Draft invoice created — open Invoices to send it." />}
        {done && "error" in done && <ErrorBanner text={done.error} />}
      </Card>
    </AssistantShell>
  );
}

function ReceiptBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
      <CheckCircle2 className="h-4 w-4" /> {text}
    </div>
  );
}
function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <AlertTriangle className="h-4 w-4" /> {text}
    </div>
  );
}

// (HelpCircle intentionally kept for future use)
void HelpCircle;
// Message ID hint for TS overlay if unused
void cn;
