import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useThreadMessages, persistUserMessage } from "@/hooks/useThreads";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Loader2,
  Send,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Wrench,
  Repeat,
  Route as RouteIcon,
  Zap,
  TrendingUp,
  Clock,
  Activity,
} from "lucide-react";
import { formatMoney, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

const search = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/assistant/$threadId")({
  validateSearch: search,
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const { q } = Route.useSearch();
  const { data: initialMessages, isLoading } = useThreadMessages(threadId);
  const [bearer, setBearer] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setBearer(data.session?.access_token ?? null));
  }, []);

  if (isLoading || bearer === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ChatWindow
      key={threadId}
      threadId={threadId}
      initialMessages={initialMessages ?? []}
      bearer={bearer}
      autoSend={q}
    />
  );
}

const QUICK_ACTIONS: { icon: typeof Send; label: string; prompt: string; tone: string }[] = [
  {
    icon: Send,
    label: "Send Payment",
    prompt: "I want to send a payment. Walk me through the smartest route.",
    tone: "from-cyan/20 to-cyan/5 border-cyan/30 text-cyan",
  },
  {
    icon: Repeat,
    label: "Request Reversal",
    prompt: "Help me open a reversal on one of my recent charges.",
    tone: "from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-400",
  },
  {
    icon: RouteIcon,
    label: "Show Best Routes",
    prompt: "Show me the best routes to send €2,500 to a supplier in Germany.",
    tone: "from-primary/20 to-primary/5 border-primary/30 text-primary",
  },
];

function ChatWindow({
  threadId,
  initialMessages,
  bearer,
  autoSend,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  bearer: string;
  autoSend?: string;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: { Authorization: `Bearer ${bearer}` },
        body: { threadId },
      }),
    [bearer, threadId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
  });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sentAuto = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, status]);

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: trimmed }],
    };
    persistUserMessage(threadId, userMsg).catch(() => {});
    await sendMessage({ text: trimmed });
    setInput("");
  };

  useEffect(() => {
    if (autoSend && !sentAuto.current && messages.length === 0) {
      sentAuto.current = true;
      submit(autoSend);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend]);

  const isLoading = status === "submitted" || status === "streaming";
  const smartPreview = useMemo(() => parseSmartPreview(input), [input]);

  return (
    <div className="flex h-full flex-col">
      {/* Premium header */}
      <div className="border-b border-border bg-gradient-to-r from-primary/10 via-cyan/5 to-transparent px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl gradient-brand shadow-lg shadow-cyan/20">
            <Sparkles className="h-5 w-5 text-white" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-success" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-sm font-semibold tracking-tight sm:text-base">
                Smart Pay Engine Intelligence
              </h1>
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-success">
                Online
              </span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              Senior payments copilot · multi-currency routing & reversals
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
              <h2 className="font-display text-lg font-semibold">How can I move money for you today?</h2>
              <p className="text-xs text-muted-foreground">
                I'll plan routes, run reversals, and show exactly what will happen — before anything moves.
              </p>
            </div>
          </div>
        )}
        {messages.map((m: UIMessage) => (
          <MessageView key={m.id} message={m} />
        ))}
        {status === "submitted" && (
          <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error.message}
          </div>
        )}
      </div>

      {/* Smart inline preview */}
      {smartPreview && !isLoading && (
        <div className="border-t border-cyan/20 bg-gradient-to-r from-cyan/10 via-primary/5 to-transparent px-4 py-3 sm:px-8">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-cyan">
            <Activity className="h-3 w-3" /> Smart preview · {smartPreview.intent}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PreviewStat icon={Zap} label="Est. fee" value={smartPreview.fee} />
            <PreviewStat icon={TrendingUp} label="Success" value={smartPreview.success} tone="success" />
            <PreviewStat icon={Clock} label="Arrives" value={smartPreview.eta} />
            <PreviewStat icon={RouteIcon} label="Best route" value={smartPreview.route} tone="cyan" />
          </div>
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            Estimate updates as you type · final preview shown after send
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="border-t border-border bg-card/40 px-4 py-3 sm:px-8"
      >
        {/* Quick action chips */}
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map(({ icon: Icon, label, prompt, tone }) => (
            <button
              key={label}
              type="button"
              disabled={isLoading}
              onClick={() => submit(prompt)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border bg-gradient-to-r px-3 py-1.5 text-[11px] font-medium transition-all hover:scale-[1.02] hover:shadow-md disabled:opacity-50",
                tone,
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send €500 to Maria. Or: reverse the Acme charge."
            rows={1}
            className="min-h-[44px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="shadow-md shadow-primary/20">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          Sandbox · the assistant always confirms before executing anything.
        </div>
      </form>
    </div>
  );
}

function PreviewStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  tone?: "success" | "cyan";
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/70 px-2.5 py-1.5 backdrop-blur">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-2.5 w-2.5" /> {label}
      </div>
      <div
        className={cn(
          "mt-0.5 truncate text-xs font-semibold",
          tone === "success" && "text-success",
          tone === "cyan" && "text-cyan",
          !tone && "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

type SmartPreview = {
  intent: string;
  fee: string;
  success: string;
  eta: string;
  route: string;
};

function parseSmartPreview(text: string): SmartPreview | null {
  if (text.trim().length < 8) return null;
  const lower = text.toLowerCase();

  const isReversal = /\b(reverse|reversal|refund|chargeback|dispute)\b/.test(lower);
  const isSend = /\b(send|pay|transfer|wire|move)\b/.test(lower);
  if (!isReversal && !isSend) return null;

  // Detect currency
  let currency: Currency = "USD";
  if (lower.includes("€") || /\beur\b/.test(lower)) currency = "EUR";
  else if (lower.includes("£") || /\bgbp\b/.test(lower)) currency = "GBP";
  else if (lower.includes("$") || /\busd\b/.test(lower)) currency = "USD";

  // Detect amount (e.g. 1,500.50 or 500 or 2.5k)
  const amtMatch = text.match(/([0-9][\d,]*(?:\.\d+)?)\s*(k|m)?/i);
  let amount = 0;
  if (amtMatch) {
    amount = parseFloat(amtMatch[1].replace(/,/g, ""));
    const suffix = amtMatch[2]?.toLowerCase();
    if (suffix === "k") amount *= 1000;
    if (suffix === "m") amount *= 1_000_000;
  }
  if (!amount) return null;

  const amtMinor = Math.round(amount * 100);

  if (isReversal) {
    const prob = amount > 1000 ? 0.78 : 0.86;
    return {
      intent: "Reversal analysis",
      fee: formatMoney(0, currency),
      success: `${Math.round(prob * 100)}%`,
      eta: "2–5 days",
      route: "Smart Dispute",
    };
  }

  // Send: estimate ~30 bps + $0.50 base
  const fee = Math.round(amtMinor * 0.003) + 50;
  const prob = amount > 10000 ? 0.94 : 0.97;
  return {
    intent: "Payment routing",
    fee: formatMoney(fee, currency),
    success: `${Math.round(prob * 100)}%`,
    eta: "≈1 hour",
    route: "Express Rails",
  };
}

function MessageView({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] space-y-2", isUser && "items-end")}>
        {!isUser && (
          <div className="flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3 text-cyan" /> Smart Pay Engine Intelligence
          </div>
        )}
        <div className={cn(isUser ? "rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground" : "")}>
          {message.parts.map((part: { type: string; text?: string }, i: number) => {
            if (part.type === "text") {
              return (
                <div key={i} className={cn("whitespace-pre-wrap text-sm leading-relaxed", !isUser && "text-foreground")}>
                  {part.text}
                </div>
              );
            }
            if (part.type.startsWith("tool-")) {
              return <ToolPart key={i} part={part as never} />;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

type ToolPartShape = {
  type: string;
  toolName?: string;
  state?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
};

function ToolPart({ part }: { part: ToolPartShape }) {
  const toolName = part.toolName ?? part.type.replace("tool-", "");
  const out = part.output ?? null;
  const isDone = part.state === "output-available" || !!out;
  return (
    <Card className="my-2 overflow-hidden border-cyan/20 bg-cyan/5 p-0">
      <div className="flex items-center gap-2 border-b border-cyan/15 px-3 py-2 text-xs">
        <Wrench className="h-3.5 w-3.5 text-cyan" />
        <span className="font-medium text-foreground">{prettyToolName(toolName)}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{isDone ? "done" : "running…"}</span>
      </div>
      {out && <div className="p-3 text-xs">{renderToolOutput(toolName, out)}</div>}
    </Card>
  );
}

function prettyToolName(n: string) {
  const map: Record<string, string> = {
    list_recent_transactions: "Reading recent transactions",
    preview_send_payment: "Smart route preview",
    execute_send_payment: "Executing payment",
    analyze_reversal: "Reversal analysis",
    create_reversal: "Opening reversal case",
  };
  return map[n] ?? n;
}

function renderToolOutput(name: string, out: Record<string, unknown>) {
  if (out.error) return <div className="text-destructive">Error: {String(out.error)}</div>;
  if (name === "preview_send_payment" && Array.isArray(out.options)) {
    const opts = out.options as Array<Record<string, unknown>>;
    const best = opts.reduce((a, b) =>
      Number(b.success_probability) > Number(a.success_probability) ? b : a,
    );
    return (
      <div className="space-y-2">
        {opts.map((o) => {
          const isBest = o.route === best.route;
          return (
            <div
              key={String(o.route)}
              className={cn(
                "rounded-lg border p-2.5 transition-colors",
                isBest ? "border-cyan/50 bg-cyan/10 shadow-sm shadow-cyan/10" : "border-border bg-background",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  {String(o.route)}
                  {isBest && (
                    <span className="rounded-full bg-cyan/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-cyan">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="text-cyan">
                  {Math.round((Number(o.success_probability) ?? 0) * 100)}% success
                </div>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>Fee {formatMoney(Number(o.fee_minor), String(o.from_currency) as Currency)}</span>
                <span>Arrives {String(o.arrives_in)}</span>
                <span>FX {String(o.fx_rate)}</span>
                <span>
                  Recipient gets {formatMoney(Number(o.recipient_gets_minor), String(o.to_currency) as Currency)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  if (name === "analyze_reversal") {
    return (
      <div className="space-y-1.5">
        <div className="text-sm font-medium text-foreground">
          {Math.round(Number(out.success_probability) * 100)}% likely to succeed
        </div>
        <div className="text-muted-foreground">Reason: {String(out.recommended_reason_code)}</div>
        <div className="text-muted-foreground">
          Recommended amount:{" "}
          {formatMoney(Number(out.recommended_amount_minor), String(out.currency) as Currency)}
        </div>
        {Array.isArray(out.evidence_needed) && (
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {(out.evidence_needed as string[]).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="mt-1 text-foreground">{String(out.recommendation)}</div>
      </div>
    );
  }
  if (name === "list_recent_transactions" && Array.isArray(out.transactions)) {
    return (
      <div className="space-y-1">
        {(out.transactions as Array<Record<string, unknown>>).slice(0, 6).map((t) => (
          <div key={String(t.id)} className="flex items-center justify-between border-b border-border/50 py-1 last:border-0">
            <span className="truncate text-foreground">
              {String(t.payee ?? t.memo ?? t.type)}
            </span>
            <span className="text-muted-foreground">
              {formatMoney(Number(t.amount), String(t.currency) as Currency)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (name === "execute_send_payment" && out.ok) {
    return (
      <div className="flex items-center gap-1.5 text-success">
        <ArrowRight className="h-3.5 w-3.5" /> Payment posted · {String(out.state)}
      </div>
    );
  }
  if (name === "create_reversal" && out.ok) {
    return (
      <div className="flex items-center gap-1.5 text-success">
        <ShieldCheck className="h-3.5 w-3.5" /> Reversal case opened · status {String(out.status)}
      </div>
    );
  }
  return <pre className="overflow-x-auto text-[10px] text-muted-foreground">{JSON.stringify(out, null, 2)}</pre>;
}
