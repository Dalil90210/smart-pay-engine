using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Entities;
using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.Exceptions;
using SmartPayEngine.Core.Services;
using SmartPayEngine.Core.Tests.TestSupport;
using SmartPayEngine.Core.ValueObjects;
using Xunit;

namespace SmartPayEngine.Core.Tests;

public class IntelligentReversalEngineTests
{
    private static readonly DateTimeOffset Now = new(2026, 6, 19, 12, 0, 0, TimeSpan.Zero);

    private static IntelligentReversalEngine Engine() => new(new FixedClock(Now));

    private static Transaction Card(
        decimal amount = 420m,
        TransactionStatus status = TransactionStatus.Completed,
        DateTimeOffset? createdAt = null,
        int riskScore = 0,
        CounterpartyType counterparty = CounterpartyType.Merchant)
        => Transaction.Create(
            new Money(amount, Currency.USD),
            Currency.USD,
            Currency.USD,
            PaymentProvider.CardNetwork,
            status,
            createdAt ?? Now.AddHours(-12),
            completedAt: createdAt ?? Now.AddHours(-12),
            counterpartyType: counterparty,
            riskScore: riskScore);

    [Fact]
    public void StrongDuplicateCharge_RecommendsFullReversal_WithHighProbability()
    {
        var tx = Card();
        var analysis = Engine().AnalyzeReversal(tx, 420m, new ReversalContext
        {
            ObservedDuplicate = true,
            AvailableEvidence = new[] { EvidenceType.DuplicateChargeRecord, EvidenceType.BankStatement },
            Customer = new CustomerRiskProfile
            {
                AccountAgeDays = 540,
                PriorSuccessfulTransactions = 80,
                KycVerified = true
            }
        });

        Assert.True(analysis.IsEligible);
        Assert.Equal(RecommendedAction.FullReversal, analysis.RecommendedAction);
        Assert.Equal(ReasonCode.DuplicateCharge, analysis.BestReasonCode);
        Assert.True(analysis.SuccessProbability >= 80, $"expected >=80 got {analysis.SuccessProbability}");
        Assert.Equal(420m, analysis.RecommendedAmount.Amount);
        Assert.Empty(analysis.RequiredEvidence);
        Assert.False(string.IsNullOrWhiteSpace(analysis.AIExplanation));
    }

    [Fact]
    public void AlreadyReversed_IsIneligible()
    {
        var tx = Card(status: TransactionStatus.Reversed);
        var analysis = Engine().AnalyzeReversal(tx, 420m);

        Assert.False(analysis.IsEligible);
        Assert.Equal(0, analysis.SuccessProbability);
        Assert.Equal(RecommendedAction.NoReversal, analysis.RecommendedAction);
        Assert.Null(analysis.BestReasonCode);
    }

    [Fact]
    public void ExpiredReversalWindow_IsIneligible()
    {
        // ACH window is 60 days; this transaction is 90 days old.
        var tx = Transaction.Create(
            new Money(200m, Currency.USD),
            Currency.USD,
            Currency.USD,
            PaymentProvider.Ach,
            TransactionStatus.Completed,
            Now.AddDays(-90),
            completedAt: Now.AddDays(-90));

        var analysis = Engine().AnalyzeReversal(tx, 200m);

        Assert.False(analysis.IsEligible);
        Assert.Contains("window", analysis.AIExplanation);
    }

    [Fact]
    public void WrongAmount_WithDisputedPortion_RecommendsPartial()
    {
        var tx = Card(amount: 1000m);
        var analysis = Engine().AnalyzeReversal(tx, 250m, new ReversalContext
        {
            ReasonHint = ReasonCode.WrongAmount,
            AvailableEvidence = new[] { EvidenceType.Invoice }
        });

        Assert.Equal(ReasonCode.WrongAmount, analysis.BestReasonCode);
        Assert.Equal(RecommendedAction.PartialReversal, analysis.RecommendedAction);
        Assert.Equal(250m, analysis.RecommendedAmount.Amount);
    }

    [Fact]
    public void HighRiskMidConfidence_RoutesToManualReview()
    {
        // High upstream risk pulls the fraud factor down into the ambiguous band.
        var tx = Card(amount: 3000m, riskScore: 70, counterparty: CounterpartyType.FirstParty);
        var analysis = Engine().AnalyzeReversal(tx, 3000m, new ReversalContext
        {
            ReasonHint = ReasonCode.Unauthorized
        });

        Assert.Equal(RecommendedAction.ManualReview, analysis.RecommendedAction);
    }

    [Fact]
    public void RequestedAmount_ExceedingTransaction_Throws()
    {
        var tx = Card(amount: 100m);
        Assert.Throws<DomainException>(() => Engine().AnalyzeReversal(tx, 200m));
    }

    [Fact]
    public void RequestedAmount_NonPositive_Throws()
    {
        var tx = Card();
        Assert.Throws<DomainException>(() => Engine().AnalyzeReversal(tx, 0m));
    }

    [Fact]
    public void Probability_DecaysAsTransactionAges()
    {
        var fresh = Engine().AnalyzeReversal(
            Card(createdAt: Now.AddHours(-2)), 420m,
            new ReversalContext { ObservedDuplicate = true, AvailableEvidence = new[] { EvidenceType.DuplicateChargeRecord } });

        var old = Engine().AnalyzeReversal(
            Card(createdAt: Now.AddDays(-100)), 420m,
            new ReversalContext { ObservedDuplicate = true, AvailableEvidence = new[] { EvidenceType.DuplicateChargeRecord } });

        Assert.True(fresh.SuccessProbability >= old.SuccessProbability);
    }
}
