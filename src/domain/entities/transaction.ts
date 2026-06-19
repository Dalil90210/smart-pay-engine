/**
 * `Transaction` entity — the core record the reversal engine reasons about.
 *
 * This is a domain entity (identity + invariants + behaviour), deliberately
 * decoupled from the persistence shape in `useTransactions`/Supabase. An
 * application-layer mapper is responsible for translating a DB row into this
 * entity; the domain never imports the database client.
 */
import { Money } from "../money";
import { DomainErrorCode, err, ok, type Result } from "../shared/result";
import { PaymentRail, railProfile } from "./payment-rail";

/** Business classification of a money movement. */
export enum TransactionType {
  Deposit = "deposit",
  Withdrawal = "withdrawal",
  Transfer = "transfer",
  /** Currency conversion (two legs, FX spread applied). */
  Fx = "fx",
  Payment = "payment",
}

/** Lifecycle state of a transaction. */
export enum TransactionStatus {
  Initiated = "initiated",
  Confirmed = "confirmed",
  Processing = "processing",
  Completed = "completed",
  Failed = "failed",
  Reversed = "reversed",
}

/** The counterparty channel — affects fraud/dispute base rates. */
export enum CounterpartyType {
  /** Verified merchant with a dispute process. */
  Merchant = "merchant",
  /** Individual / P2P payee. */
  Individual = "individual",
  /** First payment ever sent to this counterparty. */
  FirstParty = "first_party",
  Unknown = "unknown",
}

/** Snapshot of the customer's standing, used to weight risk. */
export interface CustomerRiskSnapshot {
  /** Account age in days. Older accounts are lower risk. */
  readonly accountAgeDays: number;
  /** Lifetime count of successful (non-reversed) transactions. */
  readonly priorSuccessfulTransactions: number;
  /** Count of reversals/chargebacks the customer has previously filed. */
  readonly priorReversals: number;
  /** Whether the customer has completed KYC/identity verification. */
  readonly kycVerified: boolean;
}

export interface TransactionProps {
  readonly id: string;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  /** Signed amount in minor units; the entity stores it as absolute `Money`. */
  readonly amount: Money;
  /** Settlement currency (for FX, the destination currency). */
  readonly settlementCurrency?: Money["currency"];
  readonly rail: PaymentRail;
  readonly counterpartyType: CounterpartyType;
  /** When the transaction was created. */
  readonly createdAt: Date;
  /** When it settled, if it has. Drives reversal-window math. */
  readonly settledAt?: Date | null;
  /** True when the source and destination currencies differ. */
  readonly isCrossCurrency: boolean;
  readonly customer: CustomerRiskSnapshot;
  /** Free-form metadata carried from upstream systems. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class Transaction {
  private constructor(private readonly props: TransactionProps) {}

  /**
   * Validate invariants and construct a `Transaction`. Returns a `Result`
   * rather than throwing so application code can surface field-level errors.
   */
  static create(props: TransactionProps): Result<Transaction> {
    if (!props.id.trim()) {
      return err(DomainErrorCode.Validation, "Transaction id is required", "id");
    }
    if (props.amount.minor < 0) {
      return err(
        DomainErrorCode.Validation,
        "Transaction amount must be non-negative (use direction, not sign)",
        "amount",
      );
    }
    if (props.amount.isZero) {
      return err(
        DomainErrorCode.Validation,
        "Transaction amount must be greater than zero",
        "amount",
      );
    }
    if (props.settledAt && props.settledAt < props.createdAt) {
      return err(DomainErrorCode.Invariant, "settledAt cannot precede createdAt", "settledAt");
    }
    const profile = railProfile(props.rail);
    if (!profile.supportedCurrencies.includes(props.amount.currency)) {
      return err(
        DomainErrorCode.Validation,
        `Rail ${props.rail} does not support ${props.amount.currency}`,
        "rail",
      );
    }
    return ok(new Transaction(props));
  }

  get id(): string {
    return this.props.id;
  }
  get type(): TransactionType {
    return this.props.type;
  }
  get status(): TransactionStatus {
    return this.props.status;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get rail(): PaymentRail {
    return this.props.rail;
  }
  get counterpartyType(): CounterpartyType {
    return this.props.counterpartyType;
  }
  get customer(): CustomerRiskSnapshot {
    return this.props.customer;
  }
  get isCrossCurrency(): boolean {
    return this.props.isCrossCurrency;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get settledAt(): Date | null {
    return this.props.settledAt ?? null;
  }
  get metadata(): Readonly<Record<string, unknown>> {
    return this.props.metadata ?? {};
  }

  /** Age of the transaction in hours, measured from `now`. */
  ageHours(now: Date = new Date()): number {
    return (now.getTime() - this.props.createdAt.getTime()) / 3_600_000;
  }

  /** Hours since settlement, or null if not yet settled. */
  hoursSinceSettlement(now: Date = new Date()): number | null {
    const settled = this.settledAt;
    if (!settled) return null;
    return (now.getTime() - settled.getTime()) / 3_600_000;
  }

  /** A transaction already reversed or failed cannot be reversed again. */
  get isTerminalForReversal(): boolean {
    return (
      this.props.status === TransactionStatus.Reversed ||
      this.props.status === TransactionStatus.Failed
    );
  }

  /**
   * Whether the rail's reversal window is still open. Rails without a hard
   * window (e.g. internal book transfers, recalls) are always considered open.
   */
  isWithinReversalWindow(now: Date = new Date()): boolean {
    const profile = railProfile(this.props.rail);
    if (profile.reversalWindowHours === null) return true;
    const sinceSettlement = this.hoursSinceSettlement(now);
    // Not settled yet → window has not started; reversal is still possible.
    if (sinceSettlement === null) return true;
    return sinceSettlement <= profile.reversalWindowHours;
  }

  /**
   * Quick gate: is this transaction eligible to even be analyzed for reversal?
   * The engine still runs richer scoring, but this short-circuits hopeless
   * cases (already reversed, window expired).
   */
  isReversalEligible(now: Date = new Date()): boolean {
    return !this.isTerminalForReversal && this.isWithinReversalWindow(now);
  }
}
