namespace SmartPayEngine.Core.Enums;

/// <summary>Lifecycle state of a <see cref="Entities.Transaction"/>.</summary>
public enum TransactionStatus
{
    /// <summary>Created but not yet sent to a provider.</summary>
    Pending,

    /// <summary>Accepted by the provider, settlement in flight.</summary>
    Processing,

    /// <summary>Settled successfully.</summary>
    Completed,

    /// <summary>Terminal failure; nothing was moved.</summary>
    Failed,

    /// <summary>Fully reversed after settlement.</summary>
    Reversed,

    /// <summary>Part of the amount has been reversed.</summary>
    PartiallyReversed
}

/// <summary>
/// The provider / payment rail a transaction travels over. Each value has an
/// associated <see cref="Catalogs.ProviderProfile"/> describing its economics
/// and reversibility.
/// </summary>
public enum PaymentProvider
{
    /// <summary>On-us book transfer between two platform accounts.</summary>
    InternalLedger,

    /// <summary>Visa/Mastercard card network (chargeback rights).</summary>
    CardNetwork,

    /// <summary>US ACH transfer.</summary>
    Ach,

    /// <summary>SEPA Credit Transfer (EUR).</summary>
    Sepa,

    /// <summary>UK Faster Payments.</summary>
    FasterPayments,

    /// <summary>SWIFT international wire.</summary>
    SwiftWire,

    /// <summary>Wise (multi-currency).</summary>
    Wise,

    /// <summary>Paystack (Nigeria).</summary>
    Paystack,

    /// <summary>Flutterwave (Africa).</summary>
    Flutterwave
}

/// <summary>How funds can be unwound on a rail after settlement.</summary>
public enum ReversibilityModel
{
    /// <summary>Network-mediated chargeback with consumer protection.</summary>
    Chargeback,

    /// <summary>Bank return within a fixed window using standard reason codes.</summary>
    Return,

    /// <summary>Consent-based recall; depends on the beneficiary agreeing.</summary>
    Recall,

    /// <summary>Atomic internal book reversal — always possible.</summary>
    BookReversal
}

/// <summary>Workflow status of a <see cref="Entities.ReversalRequest"/>.</summary>
public enum ReversalStatus
{
    Draft,
    Submitted,
    UnderReview,
    Approved,
    PartiallyApproved,
    Rejected,
    Cancelled
}

/// <summary>The action the engine recommends for a reversal.</summary>
public enum RecommendedAction
{
    /// <summary>Reverse the full transaction amount.</summary>
    FullReversal,

    /// <summary>Reverse only a portion of the amount.</summary>
    PartialReversal,

    /// <summary>Do not pursue a reversal — odds/exposure don't justify it.</summary>
    NoReversal,

    /// <summary>Route to a human analyst (ambiguous or high-risk).</summary>
    ManualReview
}

/// <summary>
/// Standardized dispute categories recognized by banks/card networks. Values
/// mirror the codes used elsewhere in the product.
/// </summary>
public enum ReasonCode
{
    DuplicateCharge,
    Unauthorized,
    Fraud,
    ProductNotReceived,
    ProductNotAsDescribed,
    WrongAmount,
    SubscriptionCanceled,
    CreditNotProcessed,
    ProcessingError
}

/// <summary>Categories of supporting evidence a reversal case can carry.</summary>
public enum EvidenceType
{
    Receipt,
    Invoice,
    BankStatement,
    Correspondence,
    ProofOfDelivery,
    ProofOfNonDelivery,
    IdentityVerification,
    FraudReport,
    CancellationConfirmation,
    DeviceFingerprint,
    DuplicateChargeRecord
}

/// <summary>Channel of the counterparty — affects dispute base rates.</summary>
public enum CounterpartyType
{
    /// <summary>Established merchant with a dispute process.</summary>
    Merchant,

    /// <summary>Individual / peer payee.</summary>
    Individual,

    /// <summary>First-ever payment to this counterparty.</summary>
    FirstParty,

    Unknown
}

/// <summary>Coarse confidence bucket for the engine's own estimate.</summary>
public enum ConfidenceLevel
{
    Low,
    Medium,
    High,
    VeryHigh
}
