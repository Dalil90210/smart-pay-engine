/**
 * `SmartRoutingService` — evaluates the candidate payment rails for a given
 * payment intent and recommends the best one.
 *
 * "Best" is policy-driven: the caller supplies an {@link RoutingPolicy} that
 * weights cost, speed, reliability and reversibility. The service scores every
 * eligible rail on each dimension, combines them into a weighted score, and
 * returns a ranked list plus the winner. This is the same rail-economics model
 * the reversal engine consumes, kept in one place.
 */
import type { Currency } from "@/lib/money";
import { Money } from "../money";
import { clamp, lerp, weightedAverage } from "../shared/math";
import { DomainErrorCode, err, ok, type Result } from "../shared/result";
import { PaymentRail, railsForCurrency, type RailProfile } from "../entities/payment-rail";

/** What the caller is trying to optimize for. Weights need not sum to 1. */
export interface RoutingPolicy {
  readonly weightCost: number;
  readonly weightSpeed: number;
  readonly weightReliability: number;
  /** How much to value the ability to reverse the payment later. */
  readonly weightReversibility: number;
  /** If true, rails that can't carry the amount/currency are excluded. */
  readonly requireReversible?: boolean;
}

/** A sensible default that balances all four dimensions. */
export const BALANCED_POLICY: RoutingPolicy = {
  weightCost: 0.3,
  weightSpeed: 0.25,
  weightReliability: 0.25,
  weightReversibility: 0.2,
};

export interface PaymentIntent {
  readonly amount: Money;
  readonly currency: Currency;
  /** True when the customer needs the funds to arrive quickly. */
  readonly urgent?: boolean;
}

/** Per-rail scoring breakdown returned to the caller for transparency. */
export interface RouteEvaluation {
  readonly rail: PaymentRail;
  readonly profile: RailProfile;
  /** Total fee for this rail given the amount, in minor units. */
  readonly estimatedFeeMinor: number;
  /** Normalized sub-scores in [0, 1]. */
  readonly costScore: number;
  readonly speedScore: number;
  readonly reliabilityScore: number;
  readonly reversibilityScore: number;
  /** Final weighted score in [0, 1]; higher is better. */
  readonly score: number;
}

export interface RoutingDecision {
  readonly recommended: RouteEvaluation;
  /** All eligible rails, ranked best-first. */
  readonly ranked: readonly RouteEvaluation[];
  readonly policy: RoutingPolicy;
}

export class SmartRoutingService {
  constructor(private readonly policy: RoutingPolicy = BALANCED_POLICY) {}

  /** Total cost (variable bps + flat fee) for a rail at this amount. */
  private feeMinor(profile: RailProfile, amount: Money): number {
    const variable = Math.round((amount.minor * profile.costBps) / 10_000);
    return variable + profile.flatFeeMinor;
  }

  /**
   * Score a single rail against the intent. All sub-scores are normalized to
   * [0, 1] so the policy weights are comparable.
   */
  private evaluateRail(
    profile: RailProfile,
    intent: PaymentIntent,
    cheapestFee: number,
    dearestFee: number,
  ): RouteEvaluation {
    const fee = this.feeMinor(profile, intent.amount);

    // Cost: cheapest rail scores 1, dearest scores 0.
    const costScore = dearestFee === cheapestFee ? 1 : 1 - lerp(fee, cheapestFee, dearestFee, 0, 1);

    // Speed: instant = 1, decaying toward 0 by ~96h. Urgency sharpens it.
    const speedBase = 1 - lerp(profile.settlementHours, 0, 96, 0, 1);
    const speedScore = intent.urgent ? speedBase ** 0.5 : speedBase;

    const reliabilityScore = clamp(profile.reliability, 0, 1);
    const reversibilityScore = clamp(profile.baseReversalSuccess, 0, 1);

    const score = weightedAverage([
      { label: "cost", score: costScore, weight: this.policy.weightCost },
      { label: "speed", score: speedScore, weight: this.policy.weightSpeed },
      {
        label: "reliability",
        score: reliabilityScore,
        weight: this.policy.weightReliability,
      },
      {
        label: "reversibility",
        score: reversibilityScore,
        weight: this.policy.weightReversibility,
      },
    ]);

    return {
      rail: profile.rail,
      profile,
      estimatedFeeMinor: fee,
      costScore,
      speedScore,
      reliabilityScore,
      reversibilityScore,
      score,
    };
  }

  /**
   * Evaluate all eligible rails for the intent and pick a winner.
   */
  route(intent: PaymentIntent): Result<RoutingDecision> {
    if (!intent.amount.isPositive) {
      return err(DomainErrorCode.Validation, "Routing requires a positive amount", "amount");
    }

    let candidates = railsForCurrency(intent.currency);
    if (this.policy.requireReversible) {
      candidates = candidates.filter((p) => p.baseReversalSuccess >= 0.5);
    }
    if (candidates.length === 0) {
      return err(
        DomainErrorCode.Unsupported,
        `No payment rail available for ${intent.currency} under the current policy`,
        "currency",
      );
    }

    // Pre-compute fee range so the cost dimension can be normalized.
    const fees = candidates.map((p) => this.feeMinor(p, intent.amount));
    const cheapest = Math.min(...fees);
    const dearest = Math.max(...fees);

    const ranked = candidates
      .map((p) => this.evaluateRail(p, intent, cheapest, dearest))
      .sort((a, b) => b.score - a.score);

    return ok({ recommended: ranked[0], ranked, policy: this.policy });
  }
}
