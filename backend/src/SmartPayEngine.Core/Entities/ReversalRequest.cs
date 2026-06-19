using SmartPayEngine.Core.Common;
using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.Exceptions;
using SmartPayEngine.Core.Models;
using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Core.Entities;

/// <summary>
/// A request to reverse all or part of a transaction. Carries its own
/// probability/recommendation so it can be queued and ranked. Invariants:
/// the requested amount must be positive and not exceed the original; a full
/// reversal must equal the original amount.
/// </summary>
public sealed class ReversalRequest
{
    public Guid Id { get; }

    public Guid TransactionId { get; }

    public Money RequestedAmount { get; }

    public ReversalStatus Status { get; private set; }

    /// <summary>Engine-estimated success probability in [0, 100].</summary>
    public int SuccessProbability { get; private set; }

    public RecommendedAction RecommendedAction { get; private set; }

    public ReasonCode ReasonCode { get; private set; }

    public IReadOnlyList<EvidenceType> EvidenceNeeded { get; private set; }

    public string AIExplanation { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    private ReversalRequest(
        Guid id,
        Guid transactionId,
        Money requestedAmount,
        ReversalStatus status,
        int successProbability,
        RecommendedAction recommendedAction,
        ReasonCode reasonCode,
        IReadOnlyList<EvidenceType> evidenceNeeded,
        string aIExplanation,
        DateTimeOffset createdAt)
    {
        Id = id;
        TransactionId = transactionId;
        RequestedAmount = requestedAmount;
        Status = status;
        SuccessProbability = successProbability;
        RecommendedAction = recommendedAction;
        ReasonCode = reasonCode;
        EvidenceNeeded = evidenceNeeded;
        AIExplanation = aIExplanation;
        CreatedAt = createdAt;
    }

    /// <summary>
    /// Create and validate a reversal request against the original transaction
    /// amount.
    /// </summary>
    /// <exception cref="DomainException">When an invariant is violated.</exception>
    public static ReversalRequest Create(
        Guid transactionId,
        Money requestedAmount,
        Money originalAmount,
        ReasonCode reasonCode,
        ReversalStatus status = ReversalStatus.Draft,
        DateTimeOffset? createdAt = null,
        Guid? id = null)
    {
        if (requestedAmount.Currency != originalAmount.Currency)
        {
            throw new DomainException(
                "Reversal currency must match the original transaction.",
                nameof(requestedAmount));
        }

        if (requestedAmount.IsZero)
        {
            throw new DomainException("Reversal amount must be greater than zero.", nameof(requestedAmount));
        }

        if (requestedAmount > originalAmount)
        {
            throw new DomainException(
                "Reversal amount cannot exceed the original amount.",
                nameof(requestedAmount));
        }

        return new ReversalRequest(
            id ?? Guid.NewGuid(),
            transactionId,
            requestedAmount,
            status,
            successProbability: 0,
            recommendedAction: RecommendedAction.ManualReview,
            reasonCode,
            evidenceNeeded: Array.Empty<EvidenceType>(),
            aIExplanation: string.Empty,
            createdAt ?? DateTimeOffset.UtcNow);
    }

    /// <summary>
    /// Build a request directly from an engine <see cref="ReversalAnalysis"/>,
    /// copying over the probability, action, reason code and evidence.
    /// </summary>
    public static ReversalRequest FromAnalysis(
        ReversalAnalysis analysis,
        Money originalAmount,
        DateTimeOffset? createdAt = null,
        Guid? id = null)
    {
        var reason = analysis.BestReasonCode ?? ReasonCode.ProcessingError;
        var amount = analysis.RecommendedAmount.IsZero
            ? originalAmount
            : analysis.RecommendedAmount;

        var request = Create(
            analysis.TransactionId,
            amount,
            originalAmount,
            reason,
            ReversalStatus.Submitted,
            createdAt,
            id);

        request.ApplyAnalysis(analysis);
        return request;
    }

    /// <summary>Overlay engine output onto an existing request.</summary>
    public void ApplyAnalysis(ReversalAnalysis analysis)
    {
        SuccessProbability = Scoring.ClampPercent(analysis.SuccessProbability);
        RecommendedAction = analysis.RecommendedAction;
        if (analysis.BestReasonCode is { } code)
        {
            ReasonCode = code;
        }

        EvidenceNeeded = analysis.RequiredEvidence;
        AIExplanation = analysis.AIExplanation;
    }

    /// <summary>Fraction of the original amount being reclaimed, [0, 1].</summary>
    public decimal ReclaimRatio(Money originalAmount) => RequestedAmount.RatioTo(originalAmount);

    /// <summary>
    /// Priority in [0, 100], blending success probability (winnability) with
    /// absolute exposure (size) so big and likely cases bubble up.
    /// </summary>
    public int PriorityScore
    {
        get
        {
            var probability = SuccessProbability / 100.0;
            var exposure = Scoring.Clamp((double)RequestedAmount.Amount / 1000.0, 0, 1);
            return (int)Math.Round((probability * 0.7 + exposure * 0.3) * 100);
        }
    }

    public void Submit() => Status = ReversalStatus.Submitted;

    public void Approve() => Status = ReversalStatus.Approved;

    public void Reject() => Status = ReversalStatus.Rejected;
}
