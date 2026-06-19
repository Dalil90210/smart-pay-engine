using SmartPayEngine.Core.Enums;

namespace SmartPayEngine.Core.Catalogs;

/// <summary>
/// Encodes how well each <see cref="ReasonCode"/> is supported by each
/// <see cref="ReversibilityModel"/> — i.e. the real scheme/network rules that
/// decide whether a dispute can actually be won on a given rail.
///
/// A multiplier of 1.0 means "fully supported by this rail's rulebook"; values
/// below 1.0 reflect rails where the reason code is weak or unsupported (e.g.
/// "not as described" has no standing on a consent-based SEPA recall, but is a
/// first-class card chargeback right). Values above 1.0 capture rails that are
/// especially strong for a category (e.g. statutory unauthorized-transaction
/// protection on card networks); the consuming factor clamps to [0, 1].
///
/// This is the single source of truth for rail-versus-reason economics, kept
/// separate from <see cref="ProviderCatalog"/> (rail cost/speed) and
/// <see cref="ReasonCodeCatalog"/> (evidence/base win rate) so each concern can
/// evolve independently.
/// </summary>
public static class NetworkReversalRules
{
    /// <summary>Fallback when a specific pair is not catalogued.</summary>
    private const double Default = 0.7;

    private static readonly IReadOnlyDictionary<ReversibilityModel, IReadOnlyDictionary<ReasonCode, double>> Matrix =
        new Dictionary<ReversibilityModel, IReadOnlyDictionary<ReasonCode, double>>
        {
            // Card networks: the strongest, most codified consumer protections.
            [ReversibilityModel.Chargeback] = new Dictionary<ReasonCode, double>
            {
                [ReasonCode.DuplicateCharge] = 1.10,
                [ReasonCode.Unauthorized] = 1.12,
                [ReasonCode.Fraud] = 1.12,
                [ReasonCode.ProductNotReceived] = 1.05,
                [ReasonCode.ProductNotAsDescribed] = 0.95,
                [ReasonCode.WrongAmount] = 1.00,
                [ReasonCode.SubscriptionCanceled] = 1.00,
                [ReasonCode.CreditNotProcessed] = 1.00,
                [ReasonCode.ProcessingError] = 1.05
            },

            // ACH returns: a narrow set of standardized return reason codes;
            // strong for unauthorized/error, weak for "quality" disputes.
            [ReversibilityModel.Return] = new Dictionary<ReasonCode, double>
            {
                [ReasonCode.DuplicateCharge] = 1.00,
                [ReasonCode.Unauthorized] = 0.95,
                [ReasonCode.Fraud] = 0.90,
                [ReasonCode.ProductNotReceived] = 0.50,
                [ReasonCode.ProductNotAsDescribed] = 0.40,
                [ReasonCode.WrongAmount] = 0.70,
                [ReasonCode.SubscriptionCanceled] = 0.70,
                [ReasonCode.CreditNotProcessed] = 0.60,
                [ReasonCode.ProcessingError] = 1.00
            },

            // Consent-based recalls (SEPA/SWIFT/Wise/Faster Payments): success
            // hinges on the beneficiary agreeing — weak across the board.
            [ReversibilityModel.Recall] = new Dictionary<ReasonCode, double>
            {
                [ReasonCode.DuplicateCharge] = 0.75,
                [ReasonCode.Unauthorized] = 0.60,
                [ReasonCode.Fraud] = 0.65,
                [ReasonCode.ProductNotReceived] = 0.45,
                [ReasonCode.ProductNotAsDescribed] = 0.40,
                [ReasonCode.WrongAmount] = 0.60,
                [ReasonCode.SubscriptionCanceled] = 0.45,
                [ReasonCode.CreditNotProcessed] = 0.50,
                [ReasonCode.ProcessingError] = 0.80
            },

            // Internal book transfers: we control both legs, so almost anything
            // can be unwound atomically.
            [ReversibilityModel.BookReversal] = new Dictionary<ReasonCode, double>
            {
                [ReasonCode.DuplicateCharge] = 1.10,
                [ReasonCode.Unauthorized] = 1.10,
                [ReasonCode.Fraud] = 1.05,
                [ReasonCode.ProductNotReceived] = 1.00,
                [ReasonCode.ProductNotAsDescribed] = 1.00,
                [ReasonCode.WrongAmount] = 1.10,
                [ReasonCode.SubscriptionCanceled] = 1.05,
                [ReasonCode.CreditNotProcessed] = 1.05,
                [ReasonCode.ProcessingError] = 1.10
            }
        };

    /// <summary>
    /// Raw scheme-rule multiplier for a (rail, reason) pair. May exceed 1.0 to
    /// indicate a rail that is especially strong for the category.
    /// </summary>
    public static double Multiplier(ReversibilityModel model, ReasonCode code)
        => Matrix.TryGetValue(model, out var byReason) && byReason.TryGetValue(code, out var m)
            ? m
            : Default;

    /// <summary>A short human-readable verdict on the pair, for explanations.</summary>
    public static string Describe(ReversibilityModel model, ReasonCode code)
    {
        var m = Multiplier(model, code);
        var strength = m switch
        {
            >= 1.0 => "strongly supported",
            >= 0.8 => "well supported",
            >= 0.6 => "partially supported",
            _ => "weakly supported"
        };
        return $"{code} is {strength} under a {model} ({m:0.00}×).";
    }
}
