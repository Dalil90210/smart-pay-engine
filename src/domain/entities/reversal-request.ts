/**
 * `ReversalRequest` entity.
 *
 * Represents a request (manual or engine-recommended) to reverse all or part
 * of a transaction. It carries its own probability score and priority so it
 * can be queued and ranked. The entity enforces the core invariants:
 *   - a partial reversal must be > 0 and < the original amount;
 *   - a full reversal must equal the original amount;
 *   - currency must match the transaction.
 */
import { Money } from "../money";
import { DomainErrorCode, err, ok, type Result } from "../shared/result";
import { clamp } from "../shared/math";
import { EvidenceType, ReversalReasonCode } from "./reason-code";

/** Whether the request seeks the entire amount or a portion. */
export enum ReversalType {
  Full = "full",
  Partial = "partial",
  /** The engine recommends NOT pursuing a reversal. */
  None = "none",
}

/** Workflow status — aligned with the app's existing reversals UI. */
export enum ReversalStatus {
  Draft = "draft",
  Submitted = "submitted",
  UnderReview = "under_review",
  Approved = "approved",
  PartiallyApproved = "partially_approved",
  Rejected = "rejected",
}

/** A piece of evidence attached to the case. */
export interface EvidenceItem {
  readonly type: EvidenceType;
  readonly name: string;
  readonly attachedAt: Date;
}

export interface ReversalRequestProps {
  readonly id: string;
  readonly transactionId: string;
  readonly type: ReversalType;
  readonly reasonCode: ReversalReasonCode;
  /** Amount sought. For a full reversal this equals the original amount. */
  readonly amount: Money;
  /** The original transaction amount, used to validate partial bounds. */
  readonly originalAmount: Money;
  readonly status: ReversalStatus;
  readonly evidence: readonly EvidenceItem[];
  /** Success probability in [0, 100]; defaults to 0 until scored. */
  readonly successProbability?: number;
  readonly createdAt: Date;
}

export class ReversalRequest {
  private constructor(private props: ReversalRequestProps) {}

  static create(props: ReversalRequestProps): Result<ReversalRequest> {
    if (!props.transactionId.trim()) {
      return err(DomainErrorCode.Validation, "transactionId is required", "transactionId");
    }
    if (props.amount.currency !== props.originalAmount.currency) {
      return err(
        DomainErrorCode.Invariant,
        "Reversal currency must match the original transaction",
        "amount.currency",
      );
    }
    if (props.type === ReversalType.None) {
      // A "none" recommendation should carry no amount.
      if (!props.amount.isZero) {
        return err(
          DomainErrorCode.Validation,
          "A 'none' reversal must have a zero amount",
          "amount",
        );
      }
      return ok(new ReversalRequest(props));
    }
    if (!props.amount.isPositive) {
      return err(DomainErrorCode.Validation, "Reversal amount must be greater than zero", "amount");
    }
    if (props.amount.minor > props.originalAmount.minor) {
      return err(
        DomainErrorCode.Validation,
        "Reversal amount cannot exceed the original amount",
        "amount",
      );
    }
    if (props.type === ReversalType.Full && props.amount.minor !== props.originalAmount.minor) {
      return err(
        DomainErrorCode.Validation,
        "A full reversal must equal the original amount",
        "amount",
      );
    }
    if (props.type === ReversalType.Partial && props.amount.minor >= props.originalAmount.minor) {
      return err(
        DomainErrorCode.Validation,
        "A partial reversal must be strictly less than the original amount",
        "amount",
      );
    }
    return ok(new ReversalRequest(props));
  }

  get id(): string {
    return this.props.id;
  }
  get transactionId(): string {
    return this.props.transactionId;
  }
  get type(): ReversalType {
    return this.props.type;
  }
  get reasonCode(): ReversalReasonCode {
    return this.props.reasonCode;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get originalAmount(): Money {
    return this.props.originalAmount;
  }
  get status(): ReversalStatus {
    return this.props.status;
  }
  get evidence(): readonly EvidenceItem[] {
    return this.props.evidence;
  }
  get successProbability(): number {
    return clamp(this.props.successProbability ?? 0, 0, 100);
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Fraction of the original amount being reclaimed, in [0, 1]. */
  get reclaimRatio(): number {
    return this.props.amount.ratioTo(this.props.originalAmount);
  }

  /** Does the case already carry the given evidence type? */
  hasEvidence(type: EvidenceType): boolean {
    return this.props.evidence.some((e) => e.type === type);
  }

  /**
   * Priority score in [0, 100] used to rank the work queue. It blends the
   * success probability (we want winnable cases first) with the absolute
   * exposure (bigger money first), so a near-certain small case and a coin-flip
   * large case are weighed sensibly.
   */
  get priorityScore(): number {
    const prob = this.successProbability / 100; // [0,1]
    // Diminishing-returns weighting of amount: ~$1k saturates toward 1.
    const exposure = clamp(this.props.amount.minor / 100_000, 0, 1);
    return Math.round((prob * 0.7 + exposure * 0.3) * 100);
  }

  /** Return a copy with an updated probability score (immutability helper). */
  withProbability(probability: number): ReversalRequest {
    return new ReversalRequest({
      ...this.props,
      successProbability: clamp(probability, 0, 100),
    });
  }
}
