/**
 * ReversalAnalysisPanel
 *
 * Displays the full output of the C# Intelligent Reversal Engine analysis:
 * - Eligibility verdict
 * - Success probability gauge
 * - Recommended action & amount
 * - Best reason code with label
 * - Confidence level
 * - Factor breakdown (transparent scoring)
 * - Required + suggested evidence
 * - AI natural-language explanation
 * - Submit reversal CTA
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Loader2,
  TrendingUp,
  ShieldCheck,
  FileText,
  ListChecks,
  Lightbulb,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ReversalAnalysis,
  displayAction,
  displayReason,
  displayEvidence,
  displayConfidence,
} from "@/lib/reversalEngineApi";
import { useSubmitReversalRequest } from "@/hooks/useReversalEngine";
import type { AnalyzeRequest } from "@/lib/reversalEngineApi";

type Props = {
  analysis: ReversalAnalysis;
  /** The original analyze payload, needed to re-use when filing the request. */
  analyzePayload: AnalyzeRequest;
  onDismiss?: () => void;
  onSubmitted?: (id: string) => void;
};

export function ReversalAnalysisPanel({ analysis, analyzePayload, onDismiss, onSubmitted }: Props) {
  const submit = useSubmitReversalRequest();
  const [submitted, setSubmitted] = useState(false);

  const probPct = analysis.successProbability;
  const probColor = probPct >= 70 ? "text-success" : probPct >= 45 ? "text-cyan" : "text-amber-400";
  const barColor = probPct >= 70 ? "bg-success" : probPct >= 45 ? "bg-cyan" : "bg-amber-500";

  const handleSubmit = async () => {
    try {
      const filed = await submit.mutateAsync(analyzePayload);
      setSubmitted(true);
      onSubmitted?.(filed.id);
    } catch {
      // error shown below via submit.error
    }
  };

  return (
    <div className="space-y-4">
      {/* Verdict header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan" />
            <span className="text-sm font-semibold text-foreground">
              Intelligent Reversal Engine
            </span>
            <Badge
              variant="outline"
              className="border-cyan/30 bg-cyan/10 text-[10px] uppercase tracking-wider text-cyan"
            >
              AI-scored
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            9-factor scoring · rail-aware · confidence:{" "}
            <span className="font-medium text-foreground">
              {displayConfidence(analysis.confidence)}
            </span>
          </p>
        </div>

        {/* Probability gauge */}
        <div className="flex flex-col items-end">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Success probability
          </div>
          <div className={cn("font-display text-3xl font-bold", probColor)}>{probPct}%</div>
          <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", barColor)}
              style={{ width: `${probPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Ineligible notice */}
      {!analysis.isEligible && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Not eligible for reversal</AlertTitle>
          <AlertDescription>{analysis.aIExplanation}</AlertDescription>
        </Alert>
      )}

      {analysis.isEligible && (
        <>
          {/* Key metrics grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric
              icon={ShieldCheck}
              label="Recommended action"
              value={displayAction(analysis.recommendedAction)}
              accent="cyan"
            />
            <Metric
              icon={FileText}
              label="Best reason code"
              value={analysis.bestReasonLabel ?? displayReason(analysis.bestReasonCode)}
            />
            <Metric
              icon={TrendingUp}
              label="Recommended amount"
              value={`${analysis.recommendedAmount.amount.toFixed(2)} ${analysis.recommendedAmount.currency}`}
              accent="success"
            />
            <Metric
              icon={TrendingUp}
              label="Est. recovery"
              value={`${analysis.estimatedRecovery.amount.toFixed(2)} ${analysis.estimatedRecovery.currency}`}
              accent="success"
            />
          </div>

          {/* AI explanation */}
          <div className="rounded-lg border border-cyan/20 bg-cyan/5 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Lightbulb className="h-3.5 w-3.5 text-cyan" /> AI Explanation
            </div>
            <p className="mt-1.5 leading-relaxed text-muted-foreground">{analysis.aIExplanation}</p>
          </div>

          {/* Factor breakdown */}
          {analysis.factors.length > 0 && (
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <BarChart2 className="h-3.5 w-3.5 text-cyan" /> Scoring factors
              </div>
              <div className="mt-2 space-y-2">
                {analysis.factors.map((f) => (
                  <div key={f.name}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-foreground">{f.name}</span>
                      <span className="text-muted-foreground">
                        {Math.round(f.score * 100)}%{" "}
                        <span className="text-[10px]">(w={f.weight.toFixed(1)})</span>
                      </span>
                    </div>
                    <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          f.score >= 0.7
                            ? "bg-success"
                            : f.score >= 0.4
                              ? "bg-cyan"
                              : "bg-amber-500",
                        )}
                        style={{ width: `${Math.round(f.score * 100)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{f.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ranked reason codes */}
          {analysis.rankedReasonCodes.length > 1 && (
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ListChecks className="h-3.5 w-3.5 text-cyan" /> Alternative reason codes
              </div>
              <div className="mt-2 space-y-1.5">
                {analysis.rankedReasonCodes.slice(0, 4).map((r, i) => (
                  <div key={r.code} className="flex items-center gap-2 text-[11px]">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="flex-1 font-medium text-foreground">{r.label}</span>
                    <span
                      className={cn(
                        "font-semibold",
                        r.adjustedWinRate >= 0.7
                          ? "text-success"
                          : r.adjustedWinRate >= 0.4
                            ? "text-cyan"
                            : "text-muted-foreground",
                      )}
                    >
                      {Math.round(r.adjustedWinRate * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence */}
          {(analysis.requiredEvidence.length > 0 || analysis.suggestedEvidence.length > 0) && (
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ListChecks className="h-3.5 w-3.5 text-cyan" /> Evidence checklist
              </div>
              <ul className="mt-2 space-y-1.5 text-xs">
                {analysis.requiredEvidence.map((e) => (
                  <li key={e} className="flex items-center gap-2">
                    <div className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-destructive/60" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-destructive">Required: </span>
                      {displayEvidence(e)}
                    </span>
                  </li>
                ))}
                {analysis.suggestedEvidence.map((e) => (
                  <li key={e} className="flex items-center gap-2">
                    <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">Suggested: </span>
                      {displayEvidence(e)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Submit CTA */}
          {!submitted && (
            <div className="space-y-2">
              {submit.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Submission failed</AlertTitle>
                  <AlertDescription>
                    {submit.error instanceof Error ? submit.error.message : "Unexpected error"}
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex gap-2">
                {onDismiss && (
                  <Button variant="outline" className="flex-1" onClick={onDismiss}>
                    Close
                  </Button>
                )}
                <Button
                  className="flex-1 gradient-brand text-white"
                  disabled={submit.isPending || analysis.recommendedAction === "NoReversal"}
                  onClick={handleSubmit}
                >
                  {submit.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Filing…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" /> File reversal request
                    </>
                  )}
                </Button>
              </div>
              {analysis.recommendedAction === "NoReversal" && (
                <p className="text-center text-[11px] text-muted-foreground">
                  The engine recommends not pursuing a reversal for this transaction.
                </p>
              )}
            </div>
          )}

          {submitted && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-success" />
              <AlertTitle className="text-success">Reversal request filed</AlertTitle>
              <AlertDescription>
                The request has been submitted to the Intelligent Reversal Engine and appears in
                your Reversals queue.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  accent?: "cyan" | "success";
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon
          className={cn(
            "h-3 w-3",
            accent === "cyan" && "text-cyan",
            accent === "success" && "text-success",
            !accent && "text-muted-foreground",
          )}
        />
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-sm font-semibold",
          accent === "cyan" && "text-cyan",
          accent === "success" && "text-success",
          !accent && "text-foreground",
        )}
      >
        {value}
      </div>
    </Card>
  );
}
