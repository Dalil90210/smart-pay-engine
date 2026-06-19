/**
 * `IntelligentReversalEngine` — the heart of the feature.
 *
 * Given a {@link Transaction} (and optional contextual signals) it produces a
 * {@link ReversalAssessment}: a success probability, a full/partial/none
 * recommendation, the best reason code(s), the evidence still needed, and a
 * detailed human-readable explanation.
 *
 * The scoring is a transparent, weighted model rather than a black box — every
 * factor that moves the probability is captured as a {@link WeightedFactor} and
 * echoed back in the explanation. This keeps the "AI" auditable, which matters
 * for anything touching money.
 *
 * The engine is a pure domain service: deterministic, no I/O, no framework
 * dependencies. A real ML model could later replace `scoreProbability` without
 * changing the public contract.
 */
import { Money } from "../money";
import { clamp, clampPct, round, weightedAverage } from "../shared/math";
import type { WeightedFactor } from "../shared/math";
import { ok, type Result } from "../shared/result";
import { railProfile } from "../entities/payment-rail";
import {
  EvidenceType,
  ReversalReasonCode,
  allReasonCodeProfiles,
  reasonCodeProfile,
  type ReasonCodeProfile,
} from "../entities/reason-code";
import { CounterpartyType, Transaction } from "../entities/transaction";
import { ReversalRequest, ReversalType, ReversalStatus } from "../entities/reversal-request";

/** Contextual signals the caller can supply to sharpen the analysis. */
export interface ReversalContext {
  /** Clock injection for deterministic scoring/testing. */
  readonly now?: Date;
  /** Evidence the customer already has or can readily provide. */
  readonly availableEvidence?: readonly EvidenceType[];
  /** Customer-asserted reason, if any. Biases (but does not force) ranking. */
  readonly reasonHint?: ReversalReasonCode;
  /**
   * For partial disputes (e.g. wrong amount), the amount actually contested in
   * minor units. When omitted, a contested case defaults to a full reversal.
   */
  readonly disputedAmountMinor?: number;
  /** Strong objective signal that a duplicate exists in the ledger. */
  readonly observedDuplicate?: boolean;
}

/** A reason code scored for this specific transaction. */
export interface ScoredReasonCode {
  readonly code: ReversalReasonCode;
  readonly label: string;
  /** Win rate adjusted for available evidence, in [0, 1]. */
  readonly adjustedWinRate: number;
  /** Required evidence types not yet available. */
  readonly missingRequiredEvidence: readonly EvidenceType[];
}

/** The full result of analyzing a transaction for reversal. */
export interface ReversalAssessment {
  readonly transactionId: string;
  /** Whether a reversal is worth pursuing at all. */
  readonly eligible: boolean;
  /** Success probability in [0, 100]. */
  readonly successProbability: number;
  /** Engine confidence in its own estimate, in [0, 1]. */
  readonly confidence: number;
  readonly recommendedType: ReversalType;
  readonly recommendedAmount: Money;
  /** Best reason code to file under (null when not eligible). */
  readonly bestReasonCode: ReversalReasonCode | null;
  /** Reason codes ranked best-first. */
  readonly rankedReasonCodes: readonly ScoredReasonCode[];
  /** Evidence that must be supplied to maximize the chosen reason code. */
  readonly requiredEvidence: readonly EvidenceType[];
  /** Additional evidence that would further strengthen the case. */
  readonly suggestedEvidence: readonly EvidenceType[];
  /** Transparent breakdown of every factor feeding the probability. */
  readonly factors: readonly WeightedFactor[];
  /** Queue priority in [0, 100]. */
  readonly priorityScore: number;
  /** Detailed, plain-language AI explanation. */
  readonly explanation: string;
}

export class IntelligentReversalEngine {
  /**
   * Analyze a transaction and produce a reversal assessment.
   */
  analyze(tx: Transaction, context: ReversalContext = {}): ReversalAssessment {
    const now = context.now ?? new Date();
    const available = new Set(context.availableEvidence ?? []);

    // 1) Hard eligibility gate. Hopeless cases short-circuit.
    if (!tx.isReversalEligible(now)) {
      return this.ineligibleAssessment(tx, now);
    }

    // 2) Rank reason codes given the evidence we have.
    const rankedReasonCodes = this.rankReasonCodes(available, context);
    const best = rankedReasonCodes[0];
    const bestProfile = reasonCodeProfile(best.code);

    // 3) Score the success probability from weighted factors.
    const factors = this.scoreFactors(tx, best, now);
    const probability = clampPct(weightedAverage(factors) * 100);

    // 4) Decide full vs partial vs none.
    const { type, amount } = this.decideTypeAndAmount(tx, bestProfile, probability, context);

    // 5) Evidence guidance.
    const requiredEvidence = bestProfile.requiredEvidence.filter((e) => !available.has(e));
    const suggestedEvidence = bestProfile.strengtheningEvidence.filter(
      (e) => !available.has(e) && !bestProfile.requiredEvidence.includes(e),
    );

    // 6) Confidence + priority.
    const confidence = this.scoreConfidence(tx, available, bestProfile);
    const priorityScore = this.priority(probability, amount);

    const assessment: ReversalAssessment = {
      transactionId: tx.id,
      eligible: true,
      successProbability: probability,
      confidence,
      recommendedType: type,
      recommendedAmount: amount,
      bestReasonCode: type === ReversalType.None ? null : best.code,
      rankedReasonCodes,
      requiredEvidence,
      suggestedEvidence,
      factors,
      priorityScore,
      explanation: "", // filled below so it can reference the final values
    };

    return {
      ...assessment,
      explanation: this.explain(tx, assessment, best, now),
    };
  }

  /**
   * Build a persistable {@link ReversalRequest} from an assessment. Returns a
   * failure when the assessment recommends not pursuing a reversal.
   */
  toReversalRequest(
    assessment: ReversalAssessment,
    originalAmount: Money,
    id: string,
    now: Date = new Date(),
  ): Result<ReversalRequest> {
    return ReversalRequest.create({
      id,
      transactionId: assessment.transactionId,
      type: assessment.recommendedType,
      reasonCode: assessment.bestReasonCode ?? ReversalReasonCode.ProcessingError,
      amount: assessment.recommendedAmount,
      originalAmount,
      status: ReversalStatus.Draft,
      evidence: [],
      successProbability: assessment.successProbability,
      createdAt: now,
    });
  }

  // --- internal scoring helpers -------------------------------------------

  /**
   * Score & rank every reason code for this transaction's evidence set. The
   * adjusted win rate penalizes missing required evidence heavily and rewards
   * strengthening evidence modestly. A matching `reasonHint` gets a small bias
   * so the customer's own framing wins ties.
   */
  private rankReasonCodes(
    available: ReadonlySet<EvidenceType>,
    context: ReversalContext,
  ): ScoredReasonCode[] {
    return allReasonCodeProfiles()
      .map((profile) => {
        const required = profile.requiredEvidence;
        const presentRequired = required.filter((e) => available.has(e)).length;
        const requiredRatio = required.length === 0 ? 1 : presentRequired / required.length;

        const strengthening = profile.strengtheningEvidence;
        const presentStrengthening = strengthening.filter((e) => available.has(e)).length;
        const strengtheningRatio =
          strengthening.length === 0 ? 0 : presentStrengthening / strengthening.length;

        // Missing required evidence caps the rate to 40%–100% of base.
        const requiredFactor = 0.4 + 0.6 * requiredRatio;
        // Strengthening evidence adds up to +15%.
        const strengtheningFactor = 0.85 + 0.15 * strengtheningRatio;

        let adjusted = profile.baseWinRate * requiredFactor * strengtheningFactor;

        // Objective duplicate signal supercharges the duplicate reason code.
        if (context.observedDuplicate && profile.code === ReversalReasonCode.DuplicateCharge) {
          adjusted = Math.max(adjusted, 0.9);
        }
        // Honour the customer's asserted reason as a tie-breaking bias.
        if (context.reasonHint === profile.code) {
          adjusted += 0.05;
        }

        return {
          code: profile.code,
          label: profile.label,
          adjustedWinRate: clamp(round(adjusted, 4), 0, 1),
          missingRequiredEvidence: required.filter((e) => !available.has(e)),
        } satisfies ScoredReasonCode;
      })
      .sort((a, b) => b.adjustedWinRate - a.adjustedWinRate);
  }

  /**
   * The weighted-factor model behind the success probability. Each factor is
   * normalized to [0, 1]; weights encode relative importance.
   */
  private scoreFactors(tx: Transaction, best: ScoredReasonCode, now: Date): WeightedFactor[] {
    const profile = railProfile(tx.rail);

    // Rail reversibility — the structural ceiling on what's recoverable.
    const railFactor: WeightedFactor = {
      label: "Rail reversibility",
      score: profile.baseReversalSuccess,
      weight: 0.28,
      detail: `${profile.displayName} settles via ${profile.reversibility}.`,
    };

    // Strength of the best available reason code (already evidence-adjusted).
    const reasonFactor: WeightedFactor = {
      label: "Reason code strength",
      score: best.adjustedWinRate,
      weight: 0.26,
      detail: `Best code: ${best.label} (${Math.round(
        best.adjustedWinRate * 100,
      )}% adjusted win rate).`,
    };

    // Timing — fresher disputes win more often; decays across the rail window.
    const timingFactor: WeightedFactor = {
      label: "Timing",
      score: this.timingScore(tx, now),
      weight: 0.16,
      detail: this.timingDetail(tx, now),
    };

    // Customer trust — tenure & history vs. abuse signals.
    const customerFactor: WeightedFactor = {
      label: "Customer trust",
      score: this.customerScore(tx),
      weight: 0.14,
      detail: this.customerDetail(tx),
    };

    // Amount — very large claims attract scrutiny; tiny claims are auto-OK.
    const amountFactor: WeightedFactor = {
      label: "Amount scrutiny",
      score: this.amountScore(tx),
      weight: 0.09,
      detail: `Claim of ${tx.amount.currency} ${tx.amount.toMajor().toFixed(2)}.`,
    };

    // Counterparty & FX complications.
    const contextFactor: WeightedFactor = {
      label: "Counterparty & FX",
      score: this.counterpartyScore(tx),
      weight: 0.07,
      detail: tx.isCrossCurrency
        ? "Cross-currency settlement complicates recall."
        : `Counterparty type: ${tx.counterpartyType}.`,
    };

    return [railFactor, reasonFactor, timingFactor, customerFactor, amountFactor, contextFactor];
  }

  /** Fresher is better; full score for <24h, decaying across the window. */
  private timingScore(tx: Transaction, now: Date): number {
    const profile = railProfile(tx.rail);
    const age = tx.ageHours(now);
    if (age <= 24) return 1;
    const window = profile.reversalWindowHours ?? 120 * 24;
    // Linear decay from 1 (at 24h) down to 0.35 (at the window edge).
    return clamp(1 - ((age - 24) / window) * 0.65, 0.35, 1);
  }

  private timingDetail(tx: Transaction, now: Date): string {
    const age = Math.round(tx.ageHours(now));
    const sinceSettle = tx.hoursSinceSettlement(now);
    return sinceSettle === null
      ? `Filed ${age}h after creation; not yet settled.`
      : `Filed ${age}h after creation, ${Math.round(sinceSettle)}h post-settlement.`;
  }

  /** Tenure & track record raise the score; prior reversals lower it. */
  private customerScore(tx: Transaction): number {
    const c = tx.customer;
    const tenure = clamp(c.accountAgeDays / 365, 0, 1); // 1yr saturates
    const history = clamp(c.priorSuccessfulTransactions / 50, 0, 1);
    const kyc = c.kycVerified ? 1 : 0.4;
    // Abuse penalty: repeated reversals erode credibility quickly.
    const abusePenalty = clamp(c.priorReversals * 0.12, 0, 0.6);
    const base = 0.35 * tenure + 0.3 * history + 0.35 * kyc;
    return clamp(base - abusePenalty, 0, 1);
  }

  private customerDetail(tx: Transaction): string {
    const c = tx.customer;
    return `${c.accountAgeDays}d old, ${c.priorSuccessfulTransactions} clean tx, ${c.priorReversals} prior reversals, KYC ${c.kycVerified ? "yes" : "no"}.`;
  }

  /**
   * Tiny amounts are frequently auto-refunded (score high); mid amounts are
   * neutral; very large amounts attract manual scrutiny (score lower).
   */
  private amountScore(tx: Transaction): number {
    const major = tx.amount.toMajor();
    if (major <= 25) return 0.95;
    if (major <= 500) return 0.8;
    if (major <= 2500) return 0.65;
    if (major <= 10000) return 0.5;
    return 0.38;
  }

  private counterpartyScore(tx: Transaction): number {
    let score: number;
    switch (tx.counterpartyType) {
      case CounterpartyType.Merchant:
        score = 0.85; // established dispute process
        break;
      case CounterpartyType.Individual:
        score = 0.5;
        break;
      case CounterpartyType.FirstParty:
        score = 0.45; // first interaction → higher fraud ambiguity
        break;
      default:
        score = 0.55;
    }
    if (tx.isCrossCurrency) score *= 0.8; // FX recall friction
    return clamp(score, 0, 1);
  }

  /**
   * Choose full / partial / none and the amount to claim.
   * - Below a confidence floor with low exposure → recommend `None`.
   * - A disputed sub-amount on a partial-capable reason → `Partial`.
   * - Otherwise → `Full`.
   */
  private decideTypeAndAmount(
    tx: Transaction,
    reason: ReasonCodeProfile,
    probability: number,
    context: ReversalContext,
  ): { type: ReversalType; amount: Money } {
    const currency = tx.amount.currency;

    // Not worth pursuing: low odds AND small exposure.
    if (probability < 20 && tx.amount.toMajor() < 50) {
      return { type: ReversalType.None, amount: Money.zero(currency) };
    }

    const disputed = context.disputedAmountMinor;
    const isPartialCandidate =
      reason.supportsPartial &&
      typeof disputed === "number" &&
      disputed > 0 &&
      disputed < tx.amount.minor;

    if (isPartialCandidate) {
      return {
        type: ReversalType.Partial,
        amount: Money.fromMinor(disputed, currency),
      };
    }

    return { type: ReversalType.Full, amount: tx.amount };
  }

  /**
   * Engine confidence reflects how much hard signal we had: richer evidence and
   * same-currency, settled transactions yield more confident estimates.
   */
  private scoreConfidence(
    tx: Transaction,
    available: ReadonlySet<EvidenceType>,
    reason: ReasonCodeProfile,
  ): number {
    const allRelevant = new Set<EvidenceType>([
      ...reason.requiredEvidence,
      ...reason.strengtheningEvidence,
    ]);
    const present = [...allRelevant].filter((e) => available.has(e)).length;
    const evidenceCoverage = allRelevant.size === 0 ? 0.7 : present / allRelevant.size;

    let confidence = 0.5 + 0.4 * evidenceCoverage;
    if (tx.isCrossCurrency) confidence -= 0.1;
    if (tx.settledAt === null) confidence -= 0.05;
    return clamp(round(confidence, 2), 0, 1);
  }

  /** Blend probability (winnability) with exposure (size) for queue order. */
  private priority(probability: number, amount: Money): number {
    const prob = probability / 100;
    const exposure = clamp(amount.minor / 100_000, 0, 1); // ~$1k saturates
    return Math.round((prob * 0.7 + exposure * 0.3) * 100);
  }

  private ineligibleAssessment(tx: Transaction, now: Date): ReversalAssessment {
    const reason = tx.isTerminalForReversal
      ? `Transaction is already ${tx.status} and cannot be reversed again.`
      : `The ${railProfile(tx.rail).displayName} reversal window has closed.`;
    return {
      transactionId: tx.id,
      eligible: false,
      successProbability: 0,
      confidence: 0.95,
      recommendedType: ReversalType.None,
      recommendedAmount: Money.zero(tx.amount.currency),
      bestReasonCode: null,
      rankedReasonCodes: [],
      requiredEvidence: [],
      suggestedEvidence: [],
      factors: [],
      priorityScore: 0,
      explanation:
        `Reversal not recommended for transaction ${tx.id}. ${reason} ` +
        `No further action will improve the outcome.`,
    };
  }

  /**
   * Compose the detailed AI explanation. Reads as a concise analyst note:
   * verdict → probability → reason code → evidence → factor breakdown.
   */
  private explain(
    tx: Transaction,
    a: ReversalAssessment,
    best: ScoredReasonCode,
    now: Date,
  ): string {
    const profile = railProfile(tx.rail);
    const amountStr = `${a.recommendedAmount.currency} ${a.recommendedAmount.toMajor().toFixed(2)}`;
    const lines: string[] = [];

    const verdict =
      a.recommendedType === ReversalType.None
        ? "Hold off on filing"
        : a.recommendedType === ReversalType.Partial
          ? `Pursue a PARTIAL reversal of ${amountStr}`
          : `Pursue a FULL reversal of ${amountStr}`;

    lines.push(
      `${verdict}. Estimated success probability ${a.successProbability}% ` +
        `(confidence ${Math.round(a.confidence * 100)}%).`,
    );

    if (a.bestReasonCode) {
      lines.push(
        `Recommended reason code: "${best.label}" — ${reasonCodeProfile(best.code).rationale}`,
      );
    }

    lines.push(
      `Rail: ${profile.displayName}, recovered via ${profile.reversibility}; ` +
        `${this.timingDetail(tx, now)}`,
    );

    if (a.requiredEvidence.length > 0) {
      lines.push(
        `Required evidence still missing: ${a.requiredEvidence.join(", ")}. ` +
          `Supplying it is the single biggest lever on the odds.`,
      );
    } else if (a.eligible) {
      lines.push("All required evidence for the chosen reason code is present.");
    }

    if (a.suggestedEvidence.length > 0) {
      lines.push(`Optional strengthening evidence: ${a.suggestedEvidence.join(", ")}.`);
    }

    if (a.factors.length > 0) {
      const breakdown = a.factors
        .map((f) => `${f.label} ${Math.round(f.score * 100)}%`)
        .join(" · ");
      lines.push(`Factor breakdown: ${breakdown}.`);
    }

    return lines.join("\n");
  }
}
