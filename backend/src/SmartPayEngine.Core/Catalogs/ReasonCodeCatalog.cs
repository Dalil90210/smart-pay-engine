using SmartPayEngine.Core.Enums;

namespace SmartPayEngine.Core.Catalogs;

/// <summary>
/// Static profile describing how strong a <see cref="ReasonCode"/> is and what
/// evidence wins it.
/// </summary>
/// <param name="Code">The reason code.</param>
/// <param name="Label">Human-readable label.</param>
/// <param name="BaseWinRate">Baseline win probability for a documented claim, [0, 1].</param>
/// <param name="RequiredEvidence">Evidence considered mandatory; absence caps the odds.</param>
/// <param name="StrengtheningEvidence">Evidence that further improves the odds.</param>
/// <param name="SupportsPartial">Whether the code naturally supports a partial reversal.</param>
/// <param name="Rationale">Plain-language rationale surfaced in explanations.</param>
public sealed record ReasonCodeProfile(
    ReasonCode Code,
    string Label,
    double BaseWinRate,
    IReadOnlyList<EvidenceType> RequiredEvidence,
    IReadOnlyList<EvidenceType> StrengtheningEvidence,
    bool SupportsPartial,
    string Rationale);

/// <summary>The catalogue of <see cref="ReasonCodeProfile"/>s.</summary>
public static class ReasonCodeCatalog
{
    private static readonly IReadOnlyDictionary<ReasonCode, ReasonCodeProfile> Profiles =
        new Dictionary<ReasonCode, ReasonCodeProfile>
        {
            [ReasonCode.DuplicateCharge] = new(
                ReasonCode.DuplicateCharge,
                "Duplicate charge",
                BaseWinRate: 0.88,
                RequiredEvidence: new[] { EvidenceType.DuplicateChargeRecord },
                StrengtheningEvidence: new[] { EvidenceType.BankStatement, EvidenceType.Invoice },
                SupportsPartial: false,
                Rationale: "Two identical charges from the same counterparty in a short window is " +
                           "one of the most objective, easily-proven dispute categories."),

            [ReasonCode.WrongAmount] = new(
                ReasonCode.WrongAmount,
                "Incorrect amount",
                BaseWinRate: 0.72,
                RequiredEvidence: new[] { EvidenceType.Invoice },
                StrengtheningEvidence: new[] { EvidenceType.Receipt, EvidenceType.Correspondence },
                SupportsPartial: true,
                Rationale: "When the captured amount differs from an agreed quote/invoice, the delta " +
                           "is usually conceded quickly — ideal for a partial reversal."),

            [ReasonCode.Unauthorized] = new(
                ReasonCode.Unauthorized,
                "Unauthorized transaction",
                BaseWinRate: 0.80,
                RequiredEvidence: new[] { EvidenceType.IdentityVerification },
                StrengtheningEvidence: new[] { EvidenceType.DeviceFingerprint, EvidenceType.FraudReport },
                SupportsPartial: false,
                Rationale: "The customer did not authorize the payment. Strong statutory and scheme " +
                           "protections (PSD2, Reg E, card network rules)."),

            [ReasonCode.Fraud] = new(
                ReasonCode.Fraud,
                "Confirmed fraud",
                BaseWinRate: 0.85,
                RequiredEvidence: new[] { EvidenceType.FraudReport },
                StrengtheningEvidence: new[] { EvidenceType.IdentityVerification, EvidenceType.DeviceFingerprint },
                SupportsPartial: false,
                Rationale: "Third-party fraud carries the strongest protections, but a filed " +
                           "fraud/police report is typically required to win."),

            [ReasonCode.ProductNotReceived] = new(
                ReasonCode.ProductNotReceived,
                "Product/service not received",
                BaseWinRate: 0.60,
                RequiredEvidence: new[] { EvidenceType.Correspondence },
                StrengtheningEvidence: new[] { EvidenceType.ProofOfNonDelivery, EvidenceType.Invoice },
                SupportsPartial: true,
                Rationale: "Goods/services were not delivered. Requires proof of attempted resolution " +
                           "with the counterparty before the network sides with you."),

            [ReasonCode.ProductNotAsDescribed] = new(
                ReasonCode.ProductNotAsDescribed,
                "Not as described",
                BaseWinRate: 0.50,
                RequiredEvidence: new[] { EvidenceType.Correspondence },
                StrengtheningEvidence: new[] { EvidenceType.Invoice, EvidenceType.ProofOfDelivery },
                SupportsPartial: true,
                Rationale: "Subjective category that hinges on documentation quality; partial " +
                           "settlements are a common outcome."),

            [ReasonCode.SubscriptionCanceled] = new(
                ReasonCode.SubscriptionCanceled,
                "Canceled subscription",
                BaseWinRate: 0.66,
                RequiredEvidence: new[] { EvidenceType.CancellationConfirmation },
                StrengtheningEvidence: new[] { EvidenceType.Correspondence },
                SupportsPartial: false,
                Rationale: "A charge taken after a cancellation is well-protected when the " +
                           "cancellation can be evidenced."),

            [ReasonCode.CreditNotProcessed] = new(
                ReasonCode.CreditNotProcessed,
                "Credit not processed",
                BaseWinRate: 0.7,
                RequiredEvidence: new[] { EvidenceType.Correspondence },
                StrengtheningEvidence: new[] { EvidenceType.Receipt, EvidenceType.BankStatement },
                SupportsPartial: true,
                Rationale: "A promised refund/credit was never issued — provable from prior " +
                           "correspondence and statements."),

            [ReasonCode.ProcessingError] = new(
                ReasonCode.ProcessingError,
                "Processing error",
                BaseWinRate: 0.90,
                RequiredEvidence: Array.Empty<EvidenceType>(),
                StrengtheningEvidence: new[] { EvidenceType.BankStatement, EvidenceType.DuplicateChargeRecord },
                SupportsPartial: true,
                Rationale: "System/processing errors (double-capture, wrong currency) are easily " +
                           "proven from the ledger and rarely contested.")
        };

    public static ReasonCodeProfile For(ReasonCode code) => Profiles[code];

    public static IReadOnlyCollection<ReasonCodeProfile> All => Profiles.Values.ToList();
}
