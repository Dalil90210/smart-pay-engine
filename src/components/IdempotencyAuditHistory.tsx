import { ShieldCheck, ShieldAlert, History, Trash2 } from "lucide-react";
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

export function IdempotencyAuditHistory({
  history,
  onClear,
  className = "",
  max = 6,
}: {
  history: IdempotencyAuditResult[];
  onClear?: () => void;
  className?: string;
  max?: number;
}) {
  const items = history.slice(0, max);
  const duplicates = history.filter((h) => h.used).length;

  return (
    <div
      className={`rounded-xl border border-border/70 bg-muted/10 p-3 text-xs ${className}`}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">
            Idempotency audit history
          </span>
          <span className="rounded-full border border-border bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {history.length} check{history.length === 1 ? "" : "s"} · {duplicates} dup
          </span>
        </div>
        {history.length > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            title="Clear local audit history"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          No duplicate checks yet. Each confirmation runs a check and appears here.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border/60">
          {items.map((h, i) => {
            const Icon = h.used ? ShieldAlert : ShieldCheck;
            const tone = h.used ? "text-amber-500" : "text-emerald-500";
            return (
              <li key={`${h.key}-${h.checkedAt}-${i}`} className="flex items-start gap-2 py-2">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={`font-medium ${tone}`}>{h.used ? "Duplicate" : "Unique"}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {h.key.slice(0, 8)}…{h.key.slice(-4)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      · {timeAgo(h.checkedAt)}
                    </span>
                  </div>
                  {h.match && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                      <span className="text-muted-foreground">tx</span>
                      <span className="font-mono text-foreground/80">
                        {h.match.id.slice(0, 8)}…
                      </span>
                      <span className="text-muted-foreground capitalize">· {h.match.type}</span>
                      <span
                        className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                          STATE_TONE[h.match.state] ??
                          "bg-muted/40 text-muted-foreground border-border"
                        }`}
                      >
                        {h.match.state}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        · posted {timeAgo(h.match.created_at)}
                      </span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {history.length > items.length && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Showing latest {items.length} of {history.length}.
        </p>
      )}
    </div>
  );
}
