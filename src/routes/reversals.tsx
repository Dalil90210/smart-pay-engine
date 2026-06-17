import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useReversals, useUpdateReversal, type Reversal, type ReversalStatus } from "@/hooks/useReversals";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { ShieldCheck, AlertTriangle, Loader2, FileText, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reversals")({
  head: () => ({ meta: [{ title: "Reversals — Smart Pay Engine" }] }),
  component: () => (
    <RequireAuth>
      <ReversalsPage />
    </RequireAuth>
  ),
});

const STATUS_META: Record<ReversalStatus, { label: string; cls: string; icon: typeof ShieldCheck }> = {
  submitted: { label: "Submitted", cls: "bg-muted text-muted-foreground", icon: FileText },
  under_review: { label: "Under review", cls: "bg-cyan/15 text-cyan", icon: Loader2 },
  approved: { label: "Approved", cls: "bg-success/15 text-success", icon: CheckCircle2 },
  partially_approved: { label: "Partially approved", cls: "bg-success/10 text-success", icon: CheckCircle2 },
  rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive", icon: XCircle },
};

function ReversalsPage() {
  const { data: reversals = [], isLoading } = useReversals();
  const open = reversals.filter((r) => r.status === "submitted" || r.status === "under_review");
  const closed = reversals.filter((r) => !["submitted", "under_review"].includes(r.status));

  const successRate =
    reversals.length === 0
      ? 0
      : Math.round(
          (reversals.filter((r) => r.status === "approved" || r.status === "partially_approved").length /
            reversals.length) * 100,
        );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Reversals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Smart reversal engine — AI-prioritized refund and chargeback cases.
          </p>
        </div>
        <div className="flex gap-4 text-right">
          <Stat label="Success rate" value={`${successRate}%`} accent />
          <Stat label="Open cases" value={open.length} />
          <Stat label="Resolved" value={closed.length} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Section title="Open" items={open} empty="No open reversal cases." />
          <Section title="Resolved" items={closed} empty="No resolved cases yet." />
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <div className={cn("font-display text-2xl font-bold", accent && "text-cyan")}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({ title, items, empty }: { title: string; items: Reversal[]; empty: string }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {items.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">{empty}</Card>
      ) : (
        <div className="grid gap-3">
          {items.map((r) => (
            <ReversalCard key={r.id} reversal={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReversalCard({ reversal: r }: { reversal: Reversal }) {
  const update = useUpdateReversal();
  const [evidenceName, setEvidenceName] = useState("");
  const status = STATUS_META[r.status];
  const Icon = status.icon;
  const probPct = Math.round(r.success_probability * 100);

  const advance = (next: ReversalStatus, note: string) => {
    update.mutate(
      { id: r.id, status: next, addTimeline: { label: status.label === "Under review" ? "Decision" : "Under review", note } },
      { onSuccess: () => toast.success(`Reversal updated to ${next.replace("_", " ")}`) },
    );
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", status.cls)}>
              <Icon className={cn("h-3 w-3", r.status === "under_review" && "animate-spin")} /> {status.label}
            </span>
            <span className="text-xs text-muted-foreground">Priority {r.priority_score}</span>
            {r.priority_score >= 80 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-500">
                <AlertTriangle className="h-3 w-3" /> High priority
              </span>
            )}
          </div>
          <div className="mt-2 font-display text-xl font-semibold">
            {formatMoney(r.amount_minor, r.currency)}
          </div>
          <div className="text-xs text-muted-foreground">
            Reason: {r.reason_code.replace("_", " ")} · Tx {r.transaction_id.slice(0, 8)}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Success probability</div>
          <div className="font-display text-2xl font-bold text-cyan">{probPct}%</div>
        </div>
      </div>

      {r.ai_recommendation && (
        <div className="mt-4 flex gap-2 rounded-lg border border-cyan/20 bg-cyan/5 px-3 py-2 text-xs">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" />
          <span>{r.ai_recommendation}</span>
        </div>
      )}

      {(r.timeline?.length ?? 0) > 0 && (
        <div className="mt-4 space-y-1.5">
          {r.timeline.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="h-1.5 w-1.5 rounded-full bg-cyan" />
              <span className="font-medium">{t.label}</span>
              {t.note && <span className="text-muted-foreground">— {t.note}</span>}
              <span className="ml-auto text-muted-foreground">{new Date(t.at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {(r.evidence?.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.evidence.map((e, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px]">
              <FileText className="h-3 w-3" /> {e.name}
            </span>
          ))}
        </div>
      )}

      {(r.status === "submitted" || r.status === "under_review") && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <input
            value={evidenceName}
            onChange={(e) => setEvidenceName(e.target.value)}
            placeholder="invoice.pdf"
            className="h-8 flex-1 min-w-[140px] rounded-md border border-input bg-background px-2 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!evidenceName.trim()}
            onClick={() => {
              update.mutate(
                { id: r.id, addEvidence: evidenceName.trim(), addTimeline: { label: "Evidence added", note: evidenceName.trim() } },
                { onSuccess: () => { toast.success("Evidence uploaded (sandbox)"); setEvidenceName(""); } },
              );
            }}
          >
            Upload evidence
          </Button>
          {r.status === "submitted" && (
            <Button size="sm" variant="secondary" onClick={() => advance("under_review", "Routed to review queue")}>
              Mark under review
            </Button>
          )}
          {r.status === "under_review" && (
            <>
              <Button size="sm" onClick={() => advance("approved", "Counterparty approved full refund")}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => advance("partially_approved", "Counterparty agreed to partial refund")}>
                Partial
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => advance("rejected", "Counterparty declined")}>
                Reject
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
