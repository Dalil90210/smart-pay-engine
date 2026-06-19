using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Entities;
using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Api.Contracts;

/// <summary>Inbound representation of a transaction to analyze.</summary>
public sealed record TransactionDto
{
    public Guid? Id { get; init; }
    public decimal Amount { get; init; }
    public Currency FromCurrency { get; init; }
    public Currency ToCurrency { get; init; }
    public PaymentProvider Provider { get; init; }
    public TransactionStatus Status { get; init; } = TransactionStatus.Completed;
    public DateTimeOffset? CreatedAt { get; init; }
    public DateTimeOffset? CompletedAt { get; init; }
    public CounterpartyType CounterpartyType { get; init; } = CounterpartyType.Unknown;
    public int RiskScore { get; init; }
    public Dictionary<string, string>? Metadata { get; init; }

    /// <summary>Map the DTO onto a validated domain <see cref="Transaction"/>.</summary>
    public Transaction ToDomain() => Transaction.Create(
        new Money(Amount, FromCurrency),
        FromCurrency,
        ToCurrency,
        Provider,
        Status,
        CreatedAt,
        CompletedAt,
        CounterpartyType,
        RiskScore,
        Metadata,
        Id);
}

/// <summary>Optional contextual signals supplied with an analysis request.</summary>
public sealed record ReversalContextDto
{
    public List<EvidenceType>? AvailableEvidence { get; init; }
    public ReasonCode? ReasonHint { get; init; }
    public bool ObservedDuplicate { get; init; }
    public CustomerProfileDto? Customer { get; init; }

    public ReversalContext ToDomain() => new()
    {
        AvailableEvidence = AvailableEvidence ?? new List<EvidenceType>(),
        ReasonHint = ReasonHint,
        ObservedDuplicate = ObservedDuplicate,
        Customer = Customer?.ToDomain()
    };
}

/// <summary>Inbound customer risk profile.</summary>
public sealed record CustomerProfileDto
{
    public int AccountAgeDays { get; init; }
    public int PriorSuccessfulTransactions { get; init; }
    public int PriorReversals { get; init; }
    public bool KycVerified { get; init; }

    public CustomerRiskProfile ToDomain() => new()
    {
        AccountAgeDays = AccountAgeDays,
        PriorSuccessfulTransactions = PriorSuccessfulTransactions,
        PriorReversals = PriorReversals,
        KycVerified = KycVerified
    };
}

/// <summary>Body of POST /api/reversals/analyze.</summary>
public sealed record AnalyzeReversalRequest
{
    public required TransactionDto Transaction { get; init; }
    public required decimal RequestedAmount { get; init; }
    public ReversalContextDto? Context { get; init; }
}

/// <summary>Body of POST /api/reversals/request.</summary>
public sealed record CreateReversalRequest
{
    public required TransactionDto Transaction { get; init; }
    public required decimal RequestedAmount { get; init; }
    public ReversalContextDto? Context { get; init; }
}
