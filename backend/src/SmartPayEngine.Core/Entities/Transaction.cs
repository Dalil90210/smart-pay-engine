using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.Exceptions;
using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Core.Entities;

/// <summary>
/// A money movement on the platform — the central record the reversal engine
/// and routing service reason about.
///
/// The entity is constructed through <see cref="Create"/> so invariants are
/// enforced in one place. Mutable workflow fields (status, completion time) are
/// updated through intention-revealing methods rather than open setters.
/// </summary>
public sealed class Transaction
{
    public Guid Id { get; }

    /// <summary>The principal amount, denominated in <see cref="FromCurrency"/>.</summary>
    public Money Amount { get; }

    /// <summary>Currency funds were debited in.</summary>
    public Currency FromCurrency { get; }

    /// <summary>Currency funds were credited in (differs for FX).</summary>
    public Currency ToCurrency { get; }

    public TransactionStatus Status { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    /// <summary>When settlement completed; <c>null</c> until then.</summary>
    public DateTimeOffset? CompletedAt { get; private set; }

    /// <summary>The provider / rail the transaction was sent over.</summary>
    public PaymentProvider RouteUsed { get; }

    /// <summary>The counterparty channel — influences dispute base rates.</summary>
    public CounterpartyType CounterpartyType { get; }

    /// <summary>
    /// Upstream-supplied risk score in [0, 100] (0 = clean, 100 = certain
    /// fraud). Surfaced as a first-class field because it materially affects
    /// reversal odds; also mirrored into <see cref="Metadata"/> in practice.
    /// </summary>
    public int RiskScore { get; }

    /// <summary>Free-form metadata carried from upstream systems.</summary>
    public IReadOnlyDictionary<string, string> Metadata { get; }

    private Transaction(
        Guid id,
        Money amount,
        Currency fromCurrency,
        Currency toCurrency,
        TransactionStatus status,
        DateTimeOffset createdAt,
        DateTimeOffset? completedAt,
        PaymentProvider routeUsed,
        CounterpartyType counterpartyType,
        int riskScore,
        IReadOnlyDictionary<string, string> metadata)
    {
        Id = id;
        Amount = amount;
        FromCurrency = fromCurrency;
        ToCurrency = toCurrency;
        Status = status;
        CreatedAt = createdAt;
        CompletedAt = completedAt;
        RouteUsed = routeUsed;
        CounterpartyType = counterpartyType;
        RiskScore = riskScore;
        Metadata = metadata;
    }

    /// <summary>
    /// Validate invariants and create a <see cref="Transaction"/>.
    /// </summary>
    /// <exception cref="DomainException">When an invariant is violated.</exception>
    public static Transaction Create(
        Money amount,
        Currency fromCurrency,
        Currency toCurrency,
        PaymentProvider routeUsed,
        TransactionStatus status = TransactionStatus.Completed,
        DateTimeOffset? createdAt = null,
        DateTimeOffset? completedAt = null,
        CounterpartyType counterpartyType = CounterpartyType.Unknown,
        int riskScore = 0,
        IReadOnlyDictionary<string, string>? metadata = null,
        Guid? id = null)
    {
        if (amount.IsZero)
        {
            throw new DomainException("Transaction amount must be greater than zero.", nameof(amount));
        }

        if (amount.Currency != fromCurrency)
        {
            throw new DomainException(
                "Amount currency must match FromCurrency.", nameof(amount));
        }

        if (riskScore is < 0 or > 100)
        {
            throw new DomainException("RiskScore must be between 0 and 100.", nameof(riskScore));
        }

        var created = createdAt ?? DateTimeOffset.UtcNow;
        if (completedAt is { } c && c < created)
        {
            throw new DomainException("CompletedAt cannot precede CreatedAt.", nameof(completedAt));
        }

        return new Transaction(
            id ?? Guid.NewGuid(),
            amount,
            fromCurrency,
            toCurrency,
            status,
            created,
            completedAt,
            routeUsed,
            counterpartyType,
            riskScore,
            metadata ?? new Dictionary<string, string>());
    }

    /// <summary>True when source and destination currencies differ (FX).</summary>
    public bool IsCrossCurrency => FromCurrency != ToCurrency;

    /// <summary>Age of the transaction relative to <paramref name="now"/>.</summary>
    public TimeSpan AgeFrom(DateTimeOffset now) => now - CreatedAt;

    /// <summary>
    /// Reference instant from which a reversal window is measured: completion
    /// time when settled, otherwise creation time.
    /// </summary>
    public DateTimeOffset ReversalAnchor => CompletedAt ?? CreatedAt;

    /// <summary>A transaction already reversed or failed cannot be reversed.</summary>
    public bool IsTerminalForReversal =>
        Status is TransactionStatus.Reversed or TransactionStatus.Failed;

    /// <summary>Mark the transaction settled at <paramref name="at"/>.</summary>
    public void MarkCompleted(DateTimeOffset at)
    {
        Status = TransactionStatus.Completed;
        CompletedAt = at;
    }
}
