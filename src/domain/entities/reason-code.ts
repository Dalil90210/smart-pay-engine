/**
 * Reversal reason codes & evidence taxonomy.
 *
 * Reason codes are the standardized dispute categories banks and card networks
 * recognize. Each has a different baseline win rate and a different set of
 * evidence that materially strengthens the case. These are the levers the
 * {@link IntelligentReversalEngine} pulls when ranking the "best" reason code
 * for a given transaction.
 *
 * The string values intentionally match the codes already used by the app's
 * reversals UI (`duplicate_charge`, `wrong_amount`, `unauthorized`,
 * `service_not_rendered`) and extend the set with additional standard codes.
 */

export enum ReversalReasonCode {
  DuplicateCharge = "duplicate_charge",
  WrongAmount = "wrong_amount",
  Unauthorized = "unauthorized",
  ServiceNotRendered = "service_not_rendered",
  ProductNotAsDescribed = "product_not_as_described",
  Cancelled = "cancelled_recurring",
  Fraud = "fraud",
  ProcessingError = "processing_error",
}

/** Categories of supporting evidence a case can carry. */
export enum EvidenceType {
  DuplicateRecord = "duplicate_record",
  Invoice = "invoice",
  SignedQuote = "signed_quote",
  Correspondence = "correspondence",
  IdentityVerification = "identity_verification",
  FraudReport = "fraud_report",
  DeviceLocation = "device_location",
  ProofOfNonDelivery = "proof_of_non_delivery",
  CancellationConfirmation = "cancellation_confirmation",
  BankStatement = "bank_statement",
}

/** Static profile describing how strong a reason code is and what wins it. */
export interface ReasonCodeProfile {
  readonly code: ReversalReasonCode;
  readonly label: string;
  /** Baseline win probability in [0, 1] for a documented claim. */
  readonly baseWinRate: number;
  /**
   * Evidence that meaningfully strengthens this reason code, ordered from most
   * to least impactful. Used both to rank codes and to tell the user what to
   * collect.
   */
  readonly strengtheningEvidence: readonly EvidenceType[];
  /** Evidence considered mandatory; absence caps the achievable probability. */
  readonly requiredEvidence: readonly EvidenceType[];
  /** Plain-language rationale surfaced in the AI explanation. */
  readonly rationale: string;
  /** Whether the code inherently supports a partial (amount) reversal. */
  readonly supportsPartial: boolean;
}

const PROFILES: Record<ReversalReasonCode, ReasonCodeProfile> = {
  [ReversalReasonCode.DuplicateCharge]: {
    code: ReversalReasonCode.DuplicateCharge,
    label: "Duplicate charge",
    baseWinRate: 0.88,
    strengtheningEvidence: [
      EvidenceType.DuplicateRecord,
      EvidenceType.BankStatement,
      EvidenceType.Invoice,
    ],
    requiredEvidence: [EvidenceType.DuplicateRecord],
    rationale:
      "Two identical charges from the same counterparty in a short window is " +
      "one of the most objective, easily-proven dispute categories.",
    supportsPartial: false,
  },
  [ReversalReasonCode.WrongAmount]: {
    code: ReversalReasonCode.WrongAmount,
    label: "Incorrect amount",
    baseWinRate: 0.72,
    strengtheningEvidence: [
      EvidenceType.SignedQuote,
      EvidenceType.Invoice,
      EvidenceType.Correspondence,
    ],
    requiredEvidence: [EvidenceType.Invoice],
    rationale:
      "When the captured amount differs from an agreed quote/invoice, the " +
      "delta is usually conceded quickly — well suited to a partial reversal.",
    supportsPartial: true,
  },
  [ReversalReasonCode.Unauthorized]: {
    code: ReversalReasonCode.Unauthorized,
    label: "Unauthorized transaction",
    baseWinRate: 0.8,
    strengtheningEvidence: [
      EvidenceType.IdentityVerification,
      EvidenceType.DeviceLocation,
      EvidenceType.FraudReport,
    ],
    requiredEvidence: [EvidenceType.IdentityVerification],
    rationale:
      "The customer did not authorize the payment. Strong statutory and " +
      "scheme protections (e.g. PSD2, Reg E, card network rules).",
    supportsPartial: false,
  },
  [ReversalReasonCode.ServiceNotRendered]: {
    code: ReversalReasonCode.ServiceNotRendered,
    label: "Service not rendered",
    baseWinRate: 0.6,
    strengtheningEvidence: [
      EvidenceType.ProofOfNonDelivery,
      EvidenceType.Correspondence,
      EvidenceType.Invoice,
    ],
    requiredEvidence: [EvidenceType.Correspondence],
    rationale:
      "Goods/services were not delivered. Requires proof of attempted " +
      "resolution with the counterparty before the network will side with you.",
    supportsPartial: true,
  },
  [ReversalReasonCode.ProductNotAsDescribed]: {
    code: ReversalReasonCode.ProductNotAsDescribed,
    label: "Not as described",
    baseWinRate: 0.5,
    strengtheningEvidence: [
      EvidenceType.Correspondence,
      EvidenceType.Invoice,
      EvidenceType.ProofOfNonDelivery,
    ],
    requiredEvidence: [EvidenceType.Correspondence],
    rationale:
      "Subjective category that hinges on documentation quality; partials " +
      "are common outcomes.",
    supportsPartial: true,
  },
  [ReversalReasonCode.Cancelled]: {
    code: ReversalReasonCode.Cancelled,
    label: "Cancelled recurring payment",
    baseWinRate: 0.66,
    strengtheningEvidence: [EvidenceType.CancellationConfirmation, EvidenceType.Correspondence],
    requiredEvidence: [EvidenceType.CancellationConfirmation],
    rationale:
      "A charge taken after a cancellation is well-protected when the " +
      "cancellation can be evidenced.",
    supportsPartial: false,
  },
  [ReversalReasonCode.Fraud]: {
    code: ReversalReasonCode.Fraud,
    label: "Confirmed fraud",
    baseWinRate: 0.85,
    strengtheningEvidence: [
      EvidenceType.FraudReport,
      EvidenceType.IdentityVerification,
      EvidenceType.DeviceLocation,
    ],
    requiredEvidence: [EvidenceType.FraudReport],
    rationale:
      "Third-party fraud carries the strongest protections, but a filed " +
      "fraud/police report is typically required to win.",
    supportsPartial: false,
  },
  [ReversalReasonCode.ProcessingError]: {
    code: ReversalReasonCode.ProcessingError,
    label: "Processing error",
    baseWinRate: 0.9,
    strengtheningEvidence: [EvidenceType.BankStatement, EvidenceType.DuplicateRecord],
    requiredEvidence: [],
    rationale:
      "System/processing errors (double-capture, wrong currency) are easily " +
      "proven from the ledger and rarely contested.",
    supportsPartial: true,
  },
};

export function reasonCodeProfile(code: ReversalReasonCode): ReasonCodeProfile {
  return PROFILES[code];
}

export function allReasonCodeProfiles(): readonly ReasonCodeProfile[] {
  return Object.values(PROFILES);
}
