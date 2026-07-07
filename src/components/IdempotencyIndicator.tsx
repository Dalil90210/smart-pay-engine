import { Check, Loader2, ShieldCheck, ShieldAlert, Copy } from "lucide-react";
import { useState } from "react";

export type IdempotencyStatus = "ready" | "submitting" | "posted" | "duplicate";

const STATUS_META: Record<
  IdempotencyStatus,
  { label: string; tone: string; Icon: typeof ShieldCheck }
> = {
  ready: {
    label: "Ready",
    tone: "bg-muted/40 text-muted-foreground border-border",
    Icon: ShieldCheck,
  },
  submitting: {
    label: "Submitting…",
    tone: "bg-primary/10 text-primary border-primary/30",
    Icon: Loader2,
  },
  posted: {
    label: "Posted",
    tone: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    Icon: Check,
  },
  duplicate: {
    label: "Duplicate blocked",
    tone: "bg-amber-500/10 text-amber-500 border-amber-500/40",
    Icon: ShieldAlert,
  },
};

export function IdempotencyIndicator({
  idempotencyKey,
  status,
  className = "",
}: {
  idempotencyKey: string;
  status: IdempotencyStatus;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const meta = STATUS_META[status];
  const { Icon } = meta;
  const short = `${idempotencyKey.slice(0, 8)}…${idempotencyKey.slice(-4)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(idempotencyKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs ${className}`}
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">
          Idempotency key
        </span>
        <button
          type="button"
          onClick={copy}
          title="Copy full key"
          className="flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80 hover:border-primary/40 transition-colors"
        >
          <span className="truncate">{short}</span>
          <Copy className="h-3 w-3 opacity-60" />
          {copied && <span className="ml-1 text-emerald-500">copied</span>}
        </button>
      </div>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium ${meta.tone}`}
      >
        <Icon className={`h-3 w-3 ${status === "submitting" ? "animate-spin" : ""}`} />
        {meta.label}
      </span>
    </div>
  );
}
