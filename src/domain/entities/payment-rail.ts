/**
 * Payment rail catalogue.
 *
 * A "rail" is the underlying network a payment travels over. Each rail has very
 * different economics and — crucially for the reversal engine — very different
 * reversibility characteristics. Card networks support chargebacks; push
 * payments like SEPA Credit Transfer or a wire are effectively irreversible
 * once settled and can only be recovered via a (consent-based) recall.
 *
 * These profiles are the single source of truth that both the
 * {@link SmartRoutingService} and the {@link IntelligentReversalEngine} reason
 * about.
 */
import type { Currency } from "@/lib/money";

export enum PaymentRail {
  /** Card networks (Visa/Mastercard). Strong consumer reversal rights. */
  Card = "card",
  /** US ACH transfer. Limited return windows / reason codes. */
  Ach = "ach",
  /** SEPA Credit Transfer (EUR). Push payment; recall only. */
  Sepa = "sepa",
  /** UK Faster Payments. Near-instant push payment. */
  FasterPayments = "faster_payments",
  /** SWIFT international wire. Slow, expensive, recall-only. */
  SwiftWire = "swift_wire",
  /** Book transfer between two accounts on this platform. Fully reversible. */
  Internal = "internal",
}

/** How a rail can be unwound after settlement. */
export enum ReversibilityModel {
  /** Network-mediated chargeback with consumer protection (cards). */
  Chargeback = "chargeback",
  /** Bank return within a fixed window using standardized reason codes (ACH). */
  Return = "return",
  /** Consent-based recall; depends on the beneficiary agreeing (SEPA/SWIFT). */
  Recall = "recall",
  /** Atomic internal book reversal, always possible. */
  BookReversal = "book_reversal",
}

/** Static economic + behavioural profile of a rail. */
export interface RailProfile {
  readonly rail: PaymentRail;
  readonly displayName: string;
  readonly reversibility: ReversibilityModel;
  /** Currencies the rail can natively carry. */
  readonly supportedCurrencies: readonly Currency[];
  /** Typical settlement time in hours (0 = instant). */
  readonly settlementHours: number;
  /** Variable cost in basis points (1bp = 0.01%). */
  readonly costBps: number;
  /** Flat fee in minor units (applied once per payment). */
  readonly flatFeeMinor: number;
  /** Operational reliability in [0, 1] (probability of clean settlement). */
  readonly reliability: number;
  /**
   * Baseline probability in [0, 1] that a *well-founded* reversal succeeds on
   * this rail, independent of the specific case. Cards are high; recalls low.
   */
  readonly baseReversalSuccess: number;
  /** Hard deadline (hours after settlement) to initiate a reversal, if any. */
  readonly reversalWindowHours: number | null;
}

const RAIL_PROFILES: Record<PaymentRail, RailProfile> = {
  [PaymentRail.Card]: {
    rail: PaymentRail.Card,
    displayName: "Card network",
    reversibility: ReversibilityModel.Chargeback,
    supportedCurrencies: ["USD", "EUR", "GBP"],
    settlementHours: 48,
    costBps: 290,
    flatFeeMinor: 30,
    reliability: 0.98,
    baseReversalSuccess: 0.82,
    // Card scheme chargeback rights typically run ~120 days.
    reversalWindowHours: 120 * 24,
  },
  [PaymentRail.Ach]: {
    rail: PaymentRail.Ach,
    displayName: "ACH transfer",
    reversibility: ReversibilityModel.Return,
    supportedCurrencies: ["USD"],
    settlementHours: 72,
    costBps: 25,
    flatFeeMinor: 25,
    reliability: 0.97,
    baseReversalSuccess: 0.55,
    // Unauthorized ACH debits: 60 calendar days; we model the tighter window.
    reversalWindowHours: 60 * 24,
  },
  [PaymentRail.Sepa]: {
    rail: PaymentRail.Sepa,
    displayName: "SEPA Credit Transfer",
    reversibility: ReversibilityModel.Recall,
    supportedCurrencies: ["EUR"],
    settlementHours: 24,
    costBps: 10,
    flatFeeMinor: 35,
    reliability: 0.99,
    baseReversalSuccess: 0.32,
    reversalWindowHours: 13 * 7 * 24,
  },
  [PaymentRail.FasterPayments]: {
    rail: PaymentRail.FasterPayments,
    displayName: "Faster Payments",
    reversibility: ReversibilityModel.Recall,
    supportedCurrencies: ["GBP"],
    settlementHours: 0,
    costBps: 5,
    flatFeeMinor: 20,
    reliability: 0.99,
    baseReversalSuccess: 0.3,
    reversalWindowHours: null,
  },
  [PaymentRail.SwiftWire]: {
    rail: PaymentRail.SwiftWire,
    displayName: "SWIFT wire",
    reversibility: ReversibilityModel.Recall,
    supportedCurrencies: ["USD", "EUR", "GBP"],
    settlementHours: 96,
    costBps: 60,
    flatFeeMinor: 1500,
    reliability: 0.95,
    baseReversalSuccess: 0.18,
    reversalWindowHours: null,
  },
  [PaymentRail.Internal]: {
    rail: PaymentRail.Internal,
    displayName: "Internal book transfer",
    reversibility: ReversibilityModel.BookReversal,
    supportedCurrencies: ["USD", "EUR", "GBP"],
    settlementHours: 0,
    costBps: 0,
    flatFeeMinor: 0,
    reliability: 1,
    baseReversalSuccess: 0.99,
    reversalWindowHours: null,
  },
};

export function railProfile(rail: PaymentRail): RailProfile {
  return RAIL_PROFILES[rail];
}

export function allRailProfiles(): readonly RailProfile[] {
  return Object.values(RAIL_PROFILES);
}

/** Rails capable of carrying the given currency. */
export function railsForCurrency(currency: Currency): readonly RailProfile[] {
  return allRailProfiles().filter((p) => p.supportedCurrencies.includes(currency));
}
