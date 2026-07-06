using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Core.Models;

/// <summary>
/// The rich, explainable result of analyzing a transaction for reversal,
/// produced by the <see cref="Abstractions.IIntelligentReversalEngine"/>.
/// </summary>
public sealed record ReversalAnalysis
{
    /// <summary>The transaction this analysis pertains to.</summary>
    public required Guid TransactionId { get; init; }

    /// <summary>Whether a reversal is worth pursuing at all.</summary>
    public required bool IsEligible { get; init; }

    /// <summary>Estimated success probability in [0, 100].</summary>
    public required int SuccessProbability { get; init; }

    /// <summary>Bucketed confidence in the estimate.</summary>
    public required ConfidenceLevel Confidence { get; init; }

    /// <summary>Numeric confidence in [0, 1] backing <see cref="Confidence"/>.</summary>
    public required double ConfidenceScore { get; init; }

    /// <summary>Full / partial / none / manual-review recommendation.</summary>
    public required RecommendedAction RecommendedAction { get; init; }

    /// <summary>The amount the engine recommends reclaiming.</summary>
    public required Money RecommendedAmount { get; init; }

    /// <summary>Expected recovery = recommended amount × probability.</summary>
    public required Money EstimatedRecovery { get; init; }

    /// <summary>The strongest reason code to file under, if any.</summary>
    public ReasonCode? BestReasonCode { get; init; }

    /// <summary>Human-readable label for <see cref="BestReasonCode"/>.</summary>
    public string? BestReasonLabel { get; init; }

    /// <summary>Reason codes ranked best-first for transparency.</summary>
    public required IReadOnlyList<RankedReasonCode> RankedReasonCodes { get; init; }

    /// <summary>Mandatory evidence still missing for the chosen reason code.</summary>
    public required IReadOnlyList<EvidenceType> RequiredEvidence { get; init; }

    /// <summary>Optional evidence that would further strengthen the case.</summary>
    public required IReadOnlyList<EvidenceType> SuggestedEvidence { get; init; }

    /// <summary>Transparent breakdown of every factor feeding the probability.</summary>
    public required IReadOnlyList<ScoreFactor> Factors { get; init; }

    /// <summary>Queue priority in [0, 100], blending winnability and exposure.</summary>
    public required int PriorityScore { get; init; }

    /// <summary>Detailed natural-language explanation of the verdict.</summary>
    public required string AIExplanation { get; init; }
}

/// <summary>A reason code scored for a specific transaction.</summary>
/// <param name="Code">The reason code.</param>
/// <param name="Label">Human-readable label.</param>
/// <param name="AdjustedWinRate">Win rate adjusted for available evidence, [0, 1].</param>
/// <param name="MissingRequiredEvidence">Required evidence not yet available.</param>
public sealed record RankedReasonCode(
    ReasonCode Code,
    string Label,
    double AdjustedWinRate,
    IReadOnlyList<EvidenceType> MissingRequiredEvidence);
