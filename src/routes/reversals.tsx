import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useReversals, useUpdateReversal, type Reversal, type ReversalStatus } from "@/hooks/useReversals";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import {
  ShieldCheck,
  AlertTriangle,
  Loader2,
  FileText,
  CheckCircle2,
  XCircle,
  Sparkles,
  TrendingUp,
  Target,
  Flame,
  Gauge,
  Clock,
  ListChecks,
  ArrowRight,
  Zap,
  Lightbulb,
} from "lucide-react";
import { useMemo, useState } from "react";
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

type Tier = "High" | "Medium" | "Low";
const tierFor = (score: number): Tier => (score >= 75 ? "High" : score >= 50 ? "Medium" : "Low");
const TIER_META: Record<Tier, { cls: string; icon: typeof Flame; ring: string }> = {
  High: { cls: "bg-destructive/15 text-destructive border-destructive/30", icon: Flame, ring: "ring-destructive/40" },
  Medium: { cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: AlertTriangle, ring: "ring-amber-500/40" },
  Low: { cls: "bg-muted text-muted-foreground border-border", icon: Gauge, ring: "ring-border" },
};

const REASON_META: Record<string, { label: string; rationale: string; evidence: string[] }> = {
  duplicate_charge: {
    label: "Duplicate charge",
    rationale: "Two identical charges from the same merchant within a short window — among the strongest dispute categories with banks.",
    evidence: ["Both transaction records side-by-side", "Original invoice/receipt", "Bank statement excerpt"],
  },
  wrong_amount: {
    label: "Wrong amount",
    rationale: "Amount differs materially from the agreed invoice. Counterparties usually concede quickly with a written quote.",
    evidence: ["Signed quote or invoice", "Email confirming agreed amount", "Comparison screenshot"],
  },
  unauthorized: {
    label: "Unauthorized / fraud",
    rationale: "User did not authorize the charge. Strong protections under card network rules and EU PSD2.",
    evidence: ["ID verification", "Police report or fraud report", "Device location at time of charge"],
  },
  service_not_rendered: {
    label: "Service not rendered",
    rationale: "Goods or services were not delivered as promised. Requires proof of attempted contact.",
    evidence: ["Written communications with counterparty", "Proof of non-delivery", "Original order confirmation"],
  },
};

function reasonInfo(code: string) {
  return (
    REASON_META[code] ?? {
      label: code.replace(/_/g, " "),
      rationale: "Standard dispute pathway. Provide clear documentation to maximize odds.",
      evidence: ["Original invoice or receipt", "Correspondence with counterparty", "Bank statement excerpt"],
    }
  );
}

function nextSteps(r: Reversal): { label: string; tone: "primary" | "muted" }[] {
  switch (r.status) {
    case "submitted":
      return [
        { label: "Attach supporting evidence", tone: "primary" },
        { label: "Notify counterparty of dispute", tone: "muted" },
        { label: "Route to review queue", tone: "muted" },
      ];
    case "under_review":
      return [
        { label: r.success_probability >= 0.8 ? "Push for full refund" : "Negotiate partial settlement", tone: "primary" },
        { label: "Await counterparty response (24–48h)", tone: "muted" },
        { label: "Escalate to card network if no reply", tone: "muted" },
      ];
    case "approved":
      return [{ label: "Funds returning in 1–3 business days", tone: "muted" }];
    case "partially_approved":
      return [
        { label: "Accept settlement and close case", tone: "primary" },
        { label: "Or escalate for remaining balance", tone: "muted" },
      ];
    case "rejected":
      return [
        { label: "Request second review", tone: "primary" },
        { label: "Or close and document for tax", tone: "muted" },
      ];
  }
}

function ReversalsPage() {
  const { data: reversals = [], isLoading } = useReversals();
  const open = reversals.filter((r) => r.status === "submitted" || r.status === "under_review");
  const closed = reversals.filter((r) => !["submitted", "under_review"].includes(r.status));

  const stats = useMemo(() => {
    const successRate = reversals.length
      ? Math.round(
          (reversals.filter((r) => r.status === "approved" || r.status === "partially_approved").length /
            reversals.length) * 100,
        )
      : 0;
    const tiers = { High: 0, Medium: 0, Low: 0 } as Record<Tier, number>;
    for (const r of open) tiers[tierFor(r.priority_score)]++;
    const recoverable = open.reduce((sum, r) => sum + Math.round(r.amount_minor * r.success_probability), 0);
    const recoverableCcy = open[0]?.currency ?? "USD";
    const avgProb = open.length
      ? Math.round((open.reduce((s, r) => s + r.success_probability, 0) / open.length) * 100)
      : 0;
    return { successRate, tiers, recoverable, recoverableCcy, avgProb };
  }, [reversals, open]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight">Reversals</h1>
            <span className="rounded-full border border-cyan/30 bg-cyan/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan">
              AI-prioritized
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Recover funds faster than Stripe Disputes. SPE Intelligence scores every case, picks the strongest reason code, and surfaces what evidence wins.
          </p>
        </div>
      </div>

      {/* AI Dashboard */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DashStat
          icon={TrendingUp}
          label="Recovery rate"
          value={`${stats.successRate}%`}
          hint={`${reversals.length} total cases`}
          accent="success"
        />
        <DashStat
          icon={Target}
          label="Projected recovery"
          value={formatMoney(stats.recoverable, stats.recoverableCcy)}
          hint={`Across ${open.length} open · ${stats.avgProb}% avg confidence`}
          accent="cyan"
        />
        <DashStat
          icon={Flame}
          label="High priority"
          value={stats.tiers.High}
          hint="Act today for best odds"
          accent="destructive"
        />
        <DashStat
          icon={Gauge}
          label="Med · Low"
          value={`${stats.tiers.Medium} · ${stats.tiers.Low}`}
          hint="In automated queue"
        />
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Section title="Open cases" items={open} empty="No open reversal cases — you're all caught up." />
          <Section title="Resolved" items={closed} empty="No resolved cases yet." />
        </>
      )}
    </div>
  );
}

function DashStat({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string | number;
  hint?: string;
  accent?: "cyan" | "success" | "destructive";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            accent === "cyan" && "text-cyan",
            accent === "success" && "text-success",
            accent === "destructive" && "text-destructive",
            !accent && "text-muted-foreground",
          )}
        />
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-2xl font-bold",
          accent === "cyan" && "text-cyan",
          accent === "success" && "text-success",
          accent === "destructive" && "text-destructive",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
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
  const tier = tierFor(r.priority_score);
  const tierMeta = TIER_META[tier];
  const TierIcon = tierMeta.icon;
  const reason = reasonInfo(r.reason_code);
  const projected = Math.round(r.amount_minor * r.success_probability);
  const isPartial = r.amount_minor < r.amount_minor; // placeholder; we surface "Full" vs explicit partial below
  const recommendation = r.success_probability >= 0.8 ? "full" : "partial";
  const uploadedNames = new Set((r.evidence ?? []).map((e) => e.name.toLowerCase()));
  const steps = nextSteps(r);

  const advance = (next: ReversalStatus, note: string) => {
    update.mutate(
      { id: r.id, status: next, addTimeline: { label: status.label === "Under review" ? "Decision" : "Under review", note } },
      { onSuccess: () => toast.success(`Reversal updated to ${next.replace("_", " ")}`) },
    );
  };

  const isOpen = r.status === "submitted" || r.status === "under_review";

  return (
    <Card className={cn("overflow-hidden p-0", isOpen && tier === "High" && "ring-1", isOpen && tier === "High" && tierMeta.ring)}>
      {/* Header strip */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-gradient-to-r from-card to-card/40 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", status.cls)}>
              <Icon className={cn("h-3 w-3", r.status === "under_review" && "animate-spin")} /> {status.label}
            </span>
            {isOpen && (
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", tierMeta.cls)}>
                <TierIcon className="h-3 w-3" /> {tier} priority
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">Score {r.priority_score}/100</span>
          </div>
          <div className="mt-2 font-display text-xl font-semibold">
            {formatMoney(r.amount_minor, r.currency)}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              · Tx {r.transaction_id.slice(0, 8)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Reason: <span className="text-foreground">{reason.label}</span>
          </div>
        </div>

        {/* Probability gauge */}
        <div className="flex flex-col items-end">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">AI success probability</div>
          <div className="mt-1 flex items-baseline gap-1">
            <div className="font-display text-3xl font-bold text-cyan">{probPct}</div>
            <div className="text-sm text-cyan/70">%</div>
          </div>
          <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                probPct >= 80 ? "bg-success" : probPct >= 60 ? "bg-cyan" : "bg-amber-500",
              )}
              style={{ width: `${probPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* AI Analysis grid */}
      <div className="grid gap-4 p-5 md:grid-cols-2">
        {/* Recommendation block */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-cyan">
            <Sparkles className="h-3 w-3" /> AI Analysis
          </div>

          <div className="rounded-lg border border-cyan/20 bg-cyan/5 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Lightbulb className="h-3.5 w-3.5 text-cyan" />
              Recommended: file for {recommendation === "full" ? "FULL refund" : "PARTIAL settlement"}
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Claim amount</div>
                <div className="font-semibold text-foreground">{formatMoney(r.amount_minor, r.currency)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Projected recovery</div>
                <div className="font-semibold text-success">{formatMoney(projected, r.currency)}</div>
              </div>
            </div>
            {r.ai_recommendation && (
              <div className="mt-2 border-t border-cyan/15 pt-2 text-muted-foreground">
                {r.ai_recommendation}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background/50 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Zap className="h-3.5 w-3.5 text-cyan" /> Why this reason code?
            </div>
            <div className="mt-1 text-muted-foreground">{reason.rationale}</div>
          </div>
        </div>

        {/* Evidence + Next steps */}
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ListChecks className="h-3.5 w-3.5 text-cyan" /> Evidence checklist
            </div>
            <ul className="mt-2 space-y-1.5 text-xs">
              {reason.evidence.map((item) => {
                const done = uploadedNames.has(item.toLowerCase());
                return (
                  <li key={item} className="flex items-center gap-2">
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                    ) : (
                      <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                    )}
                    <span className={cn(done ? "text-foreground line-through" : "text-muted-foreground")}>{item}</span>
                  </li>
                );
              })}
              {(r.evidence ?? []).filter((e) => !reason.evidence.some((s) => s.toLowerCase() === e.name.toLowerCase())).map((e) => (
                <li key={e.name} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                  <span className="text-foreground">{e.name}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-background/50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ArrowRight className="h-3.5 w-3.5 text-cyan" /> Suggested next steps
            </div>
            <ol className="mt-2 space-y-1.5 text-xs">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                      s.tone === "primary" ? "bg-cyan text-background" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className={cn(s.tone === "primary" ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {s.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {(r.timeline?.length ?? 0) > 0 && (
        <div className="border-t border-border bg-muted/20 px-5 py-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3 w-3" /> Case timeline
          </div>
          <div className="mt-2 space-y-1.5">
            {r.timeline.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="h-1.5 w-1.5 rounded-full bg-cyan" />
                <span className="font-medium">{t.label}</span>
                {t.note && <span className="text-muted-foreground">— {t.note}</span>}
                <span className="ml-auto text-muted-foreground">{new Date(t.at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {isOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card/60 p-4">
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
