import { ShieldCheck, ShieldAlert, Clock } from "lucide-react";
import type { IdempotencyAuditResult } from "@/lib/ledger";

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleString();
}

const STATE_TONE: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  initiated: "bg-amber-500/10 text-amber-500 border-amber-500/40",
  failed: "bg-rose-500/10 text-rose-500 border-rose-500/30",
};

export function IdempotencyAudit({
  audit,
  className = "",
}: {
  audit: IdempotencyAuditResult | null;
  className?: string;
}) {
  const duplicate = !!audit?.used;
  const Icon = duplicate ? ShieldAlert : ShieldCheck;
  const headline = !audit
    ? "No duplicate check run yet"
    : duplicate
      ? "Duplicate detected"
      : "Unique — safe to submit";

  return (
    <div
      className={`rounded-xl border border-border/70 bg-muted/10 p-3 text-xs ${className}`}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">
            Idempotency audit
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium ${
              !audit
                ? "bg-muted/30 text-muted-foreground border-border"
                : duplicate
                  ? "bg-amber-500/10 text-amber-500 border-amber-500/40"
                  : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
            }`}
          >
            <Icon className="h-3 w-3" />
            {headline}
          </span>
        </div>
        {audit && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {timeAgo(audit.checkedAt)}
          </span>
        )}
      </div>

      {audit?.match ? (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="text-muted-foreground">Matched tx</div>
          <div className="font-mono text-foreground/80 text-right">
            {audit.match.id.slice(0, 8)}…
          </div>
          <div className="text-muted-foreground">Type</div>
          <div className="text-right capitalize">{audit.match.type}</div>
          <div className="text-muted-foreground">Status</div>
          <div className="text-right">
            <span
              className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                STATE_TONE[audit.match.state] ?? "bg-muted/40 text-muted-foreground border-border"
              }`}
            >
              {audit.match.state}
            </span>
          </div>
          <div className="text-muted-foreground">Posted</div>
          <div className="text-right">{timeAgo(audit.match.created_at)}</div>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {audit
            ? "No prior transaction found for this key."
            : "Runs automatically when you confirm. The result and any matched transaction will appear here."}
        </p>
      )}
    </div>
  );
}
