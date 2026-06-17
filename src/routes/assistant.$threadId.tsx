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
import { Loader2, Send, Sparkles, ShieldCheck, ArrowRight, Wrench } from "lucide-react";
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

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-8">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md text-center text-sm text-muted-foreground">
            Ask anything about your payments, FX, or reversals.
          </div>
        )}
        {messages.map((m) => (
          <MessageView key={m.id} message={m} />
        ))}
        {status === "submitted" && (
          <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error.message}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="border-t border-border bg-card/40 px-4 py-3 sm:px-8"
      >
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
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
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

function MessageView({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] space-y-2", isUser && "items-end")}>
        {!isUser && (
          <div className="flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3 text-cyan" /> Assistant
          </div>
        )}
        <div className={cn(isUser ? "rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground" : "")}>
          {message.parts.map((part, i) => {
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
    return (
      <div className="space-y-2">
        {(out.options as Array<Record<string, unknown>>).map((o) => (
          <div key={String(o.route)} className="rounded-lg border border-border bg-background p-2.5">
            <div className="flex items-center justify-between">
              <div className="font-medium text-foreground">{String(o.route)}</div>
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
        ))}
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
