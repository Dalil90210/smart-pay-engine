/**
 * Typed client for the C# Intelligent Reversal Engine API.
 *
 * Configure the base URL via VITE_BACKEND_URL (defaults to http://localhost:5102).
 * The client mirrors the request/response contracts in:
 *   backend/src/SmartPayEngine.Api/Contracts/ReversalContracts.cs
 *   backend/src/SmartPayEngine.Core/Models/ReversalAnalysis.cs
 *   backend/src/SmartPayEngine.Core/Entities/ReversalRequest.cs
 */

const BASE_URL = (import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5102").replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Enums (mirror SmartPayEngine.Core.Enums)
// ---------------------------------------------------------------------------

export type TransactionStatus =
  "Pending" | "Processing" | "Completed" | "Failed" | "Reversed" | "PartiallyReversed";

export type PaymentProvider =
  | "InternalLedger"
  | "CardNetwork"
  | "Ach"
  | "Sepa"
  | "FasterPayments"
  | "SwiftWire"
  | "Wise"
  | "Paystack"
  | "Flutterwave";

export type CounterpartyType = "Merchant" | "Individual" | "FirstParty" | "Unknown";

export type RecommendedAction = "FullReversal" | "PartialReversal" | "NoReversal" | "ManualReview";

export type ReasonCode =
  | "DuplicateCharge"
  | "Unauthorized"
  | "Fraud"
  | "ProductNotReceived"
  | "ProductNotAsDescribed"
  | "WrongAmount"
  | "SubscriptionCanceled"
  | "CreditNotProcessed"
  | "ProcessingError";

export type EvidenceType =
  | "Receipt"
  | "Invoice"
  | "BankStatement"
  | "Correspondence"
  | "ProofOfDelivery"
  | "ProofOfNonDelivery"
  | "IdentityVerification"
  | "FraudReport"
  | "CancellationConfirmation"
  | "DeviceFingerprint"
  | "DuplicateChargeRecord";

export type ConfidenceLevel = "Low" | "Medium" | "High" | "VeryHigh";

export type BackendReversalStatus =
  | "Draft"
  | "Submitted"
  | "UnderReview"
  | "Approved"
  | "PartiallyApproved"
  | "Rejected"
  | "Cancelled";

// ---------------------------------------------------------------------------
// Value objects
// ---------------------------------------------------------------------------

export type Money = {
  amount: number;
  currency: string;
};

export type ScoreFactor = {
  name: string;
  score: number;
  weight: number;
  detail: string;
};

export type RankedReasonCode = {
  code: ReasonCode;
  label: string;
  adjustedWinRate: number;
  missingRequiredEvidence: EvidenceType[];
};

// ---------------------------------------------------------------------------
// Analysis result (mirrors ReversalAnalysis)
// ---------------------------------------------------------------------------

export type ReversalAnalysis = {
  transactionId: string;
  isEligible: boolean;
  successProbability: number;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  recommendedAction: RecommendedAction;
  recommendedAmount: Money;
  estimatedRecovery: Money;
  bestReasonCode: ReasonCode | null;
  bestReasonLabel: string | null;
  rankedReasonCodes: RankedReasonCode[];
  requiredEvidence: EvidenceType[];
  suggestedEvidence: EvidenceType[];
  factors: ScoreFactor[];
  priorityScore: number;
  aIExplanation: string;
};

// ---------------------------------------------------------------------------
// Filed reversal request (mirrors ReversalRequest entity)
// ---------------------------------------------------------------------------

export type FiledReversalRequest = {
  id: string;
  transactionId: string;
  requestedAmount: Money;
  status: BackendReversalStatus;
  successProbability: number;
  recommendedAction: RecommendedAction;
  reasonCode: ReasonCode;
  evidenceNeeded: EvidenceType[];
  aIExplanation: string;
  createdAt: string;
  priorityScore: number;
};

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

export type TransactionDto = {
  id?: string;
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  provider: PaymentProvider;
  status?: TransactionStatus;
  createdAt?: string;
  completedAt?: string;
  counterpartyType?: CounterpartyType;
  riskScore?: number;
  metadata?: Record<string, string>;
};

export type ReversalContextDto = {
  availableEvidence?: EvidenceType[];
  reasonHint?: ReasonCode;
  observedDuplicate?: boolean;
  customer?: {
    accountAgeDays: number;
    priorSuccessfulTransactions: number;
    priorReversals: number;
    kycVerified: boolean;
  };
  disputedAmount?: number;
  counterpartyHasDisputeHistory?: boolean;
};

export type AnalyzeRequest = {
  transaction: TransactionDto;
  requestedAmount: number;
  context?: ReversalContextDto;
};

export type CreateReversalRequestPayload = {
  transaction: TransactionDto;
  requestedAmount: number;
  context?: ReversalContextDto;
};

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(`Reversal Engine error (${res.status}): ${detail}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Analyze a transaction for reversal. Read-only — nothing is persisted. */
export async function analyzeReversal(payload: AnalyzeRequest): Promise<ReversalAnalysis> {
  return request<ReversalAnalysis>("/api/reversals/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * File a reversal request: runs the engine, persists the request, and
 * returns the created resource.
 */
export async function createReversalRequest(
  payload: CreateReversalRequestPayload,
): Promise<FiledReversalRequest> {
  return request<FiledReversalRequest>("/api/reversals/request", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Fetch a previously filed reversal request by ID. */
export async function getReversalRequest(id: string): Promise<FiledReversalRequest> {
  return request<FiledReversalRequest>(`/api/reversals/${id}`);
}

/** List all filed reversal requests, highest priority first. */
export async function listReversalRequests(): Promise<FiledReversalRequest[]> {
  return request<FiledReversalRequest[]>("/api/reversals");
}

/** Approve a filed reversal request. */
export async function approveReversalRequest(id: string): Promise<FiledReversalRequest> {
  return request<FiledReversalRequest>(`/api/reversals/${id}/approve`, { method: "POST" });
}

/** Reject a filed reversal request. */
export async function rejectReversalRequest(id: string): Promise<FiledReversalRequest> {
  return request<FiledReversalRequest>(`/api/reversals/${id}/reject`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<RecommendedAction, string> = {
  FullReversal: "Full reversal",
  PartialReversal: "Partial reversal",
  NoReversal: "Do not pursue",
  ManualReview: "Manual review",
};

const REASON_LABELS: Record<ReasonCode, string> = {
  DuplicateCharge: "Duplicate charge",
  Unauthorized: "Unauthorized transaction",
  Fraud: "Fraud",
  ProductNotReceived: "Product not received",
  ProductNotAsDescribed: "Product not as described",
  WrongAmount: "Wrong amount",
  SubscriptionCanceled: "Subscription canceled",
  CreditNotProcessed: "Credit not processed",
  ProcessingError: "Processing error",
};

const EVIDENCE_LABELS: Record<EvidenceType, string> = {
  Receipt: "Receipt",
  Invoice: "Invoice",
  BankStatement: "Bank statement",
  Correspondence: "Correspondence with counterparty",
  ProofOfDelivery: "Proof of delivery",
  ProofOfNonDelivery: "Proof of non-delivery",
  IdentityVerification: "Identity verification",
  FraudReport: "Fraud report",
  CancellationConfirmation: "Cancellation confirmation",
  DeviceFingerprint: "Device fingerprint",
  DuplicateChargeRecord: "Duplicate charge record",
};

export const displayAction = (a: RecommendedAction) => ACTION_LABELS[a] ?? a;
export const displayReason = (c: ReasonCode | null) => (c ? (REASON_LABELS[c] ?? c) : "—");
export const displayEvidence = (e: EvidenceType) => EVIDENCE_LABELS[e] ?? e;
export const displayConfidence = (c: ConfidenceLevel) => {
  const m: Record<ConfidenceLevel, string> = {
    Low: "Low",
    Medium: "Medium",
    High: "High",
    VeryHigh: "Very high",
  };
  return m[c] ?? c;
};
