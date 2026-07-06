using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Entities;
using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.Services;
using SmartPayEngine.Core.Tests.TestSupport;
using SmartPayEngine.Core.ValueObjects;
using Xunit;

namespace SmartPayEngine.Core.Tests;

/// <summary>
/// Focused coverage of the deepened engine behaviours: scheme-rule fit across
/// rails, settlement-state handling, reversal-abuse penalties, explicit
/// disputed-amount sizing, high-value escalation, and explanation content.
/// </summary>
public class IntelligentReversalEngineDeepTests
{
    private static readonly DateTimeOffset Now = new(2026, 6, 19, 12, 0, 0, TimeSpan.Zero);

    private static IntelligentReversalEngine Engine() => new(new FixedClock(Now));

    private static Transaction Tx(
        PaymentProvider provider,
        decimal amount = 500m,
        Currency currency = Currency.USD,
        TransactionStatus status = TransactionStatus.Completed,
        DateTimeOffset? createdAt = null,
        int riskScore = 0,
        CounterpartyType counterparty = CounterpartyType.Merchant)
        => Transaction.Create(
            new Money(amount, currency),
            currency,
            currency,
            provider,
            status,
            createdAt ?? Now.AddHours(-6),
            completedAt: status == TransactionStatus.Completed ? (createdAt ?? Now.AddHours(-6)) : null,
            counterpartyType: counterparty,
            riskScore: riskScore);

    [Fact]
    public void SchemeFit_CardBeatsRecallRail_ForUnauthorized()
    {
        var ctx = new ReversalContext
        {
            ReasonHint = ReasonCode.Unauthorized,
            AvailableEvidence = new[] { EvidenceType.IdentityVerification }
        };

        var card = Engine().AnalyzeReversal(Tx(PaymentProvider.CardNetwork), 500m, ctx);
        var wire = Engine().AnalyzeReversal(
            Tx(PaymentProvider.SwiftWire), 500m, ctx);

        // A chargeback rail should beat a consent-based recall for the same case.
        Assert.True(
            card.SuccessProbability > wire.SuccessProbability,
            $"card {card.SuccessProbability} vs wire {wire.SuccessProbability}");
    }

    [Fact]
    public void PreSettlementTransaction_ScoresHigher_AndExplains()
    {
        var ctx = new ReversalContext { ReasonHint = ReasonCode.ProcessingError };

        var pending = Engine().AnalyzeReversal(
            Tx(PaymentProvider.CardNetwork, status: TransactionStatus.Pending), 500m, ctx);
        var settled = Engine().AnalyzeReversal(
            Tx(PaymentProvider.CardNetwork, status: TransactionStatus.Completed), 500m, ctx);

        Assert.True(pending.SuccessProbability >= settled.SuccessProbability);
        Assert.Contains("settle", pending.AIExplanation, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ReversalAbuse_LowersProbability()
    {
        var clean = new CustomerRiskProfile
        {
            AccountAgeDays = 700,
            PriorSuccessfulTransactions = 100,
            PriorReversals = 0,
            KycVerified = true
        };
        var abuser = clean with { PriorSuccessfulTransactions = 10, PriorReversals = 15 };

        var good = Engine().AnalyzeReversal(Tx(PaymentProvider.CardNetwork), 500m,
            new ReversalContext { ReasonHint = ReasonCode.Fraud, Customer = clean });
        var bad = Engine().AnalyzeReversal(Tx(PaymentProvider.CardNetwork), 500m,
            new ReversalContext { ReasonHint = ReasonCode.Fraud, Customer = abuser });

        Assert.True(good.SuccessProbability > bad.SuccessProbability);
    }

    [Fact]
    public void ExplicitDisputedAmount_SizesPartialReversal()
    {
        var tx = Tx(PaymentProvider.CardNetwork, amount: 1000m);
        var analysis = Engine().AnalyzeReversal(tx, 1000m, new ReversalContext
        {
            ReasonHint = ReasonCode.WrongAmount,
            AvailableEvidence = new[] { EvidenceType.Invoice },
            DisputedAmount = 120m
        });

        Assert.Equal(RecommendedAction.PartialReversal, analysis.RecommendedAction);
        Assert.Equal(120m, analysis.RecommendedAmount.Amount);
    }

    [Fact]
    public void HighValueClaim_EscalatesToManualReview()
    {
        // Large exposure with non-certain odds should route to a human even when
        // the reason is otherwise reasonable.
        var tx = Tx(PaymentProvider.SwiftWire, amount: 80_000m, counterparty: CounterpartyType.Individual);
        var analysis = Engine().AnalyzeReversal(tx, 80_000m, new ReversalContext
        {
            ReasonHint = ReasonCode.ProductNotReceived
        });

        Assert.Equal(RecommendedAction.ManualReview, analysis.RecommendedAction);
    }

    [Fact]
    public void CounterpartyDisputeHistory_RaisesProbability()
    {
        var baseCtx = new ReversalContext { ReasonHint = ReasonCode.ProductNotReceived };
        var withHistory = baseCtx with { CounterpartyHasDisputeHistory = true };

        var without = Engine().AnalyzeReversal(Tx(PaymentProvider.CardNetwork), 500m, baseCtx);
        var with = Engine().AnalyzeReversal(Tx(PaymentProvider.CardNetwork), 500m, withHistory);

        Assert.True(with.SuccessProbability >= without.SuccessProbability);
    }

    [Fact]
    public void EveryProbabilityPoint_IsBackedByFactors()
    {
        var analysis = Engine().AnalyzeReversal(Tx(PaymentProvider.CardNetwork), 500m,
            new ReversalContext { ReasonHint = ReasonCode.DuplicateCharge });

        Assert.NotEmpty(analysis.Factors);
        Assert.All(analysis.Factors, f =>
        {
            Assert.InRange(f.Score, 0.0, 1.0);
            Assert.True(f.Weight > 0);
            Assert.False(string.IsNullOrWhiteSpace(f.Detail));
        });
        Assert.Contains(analysis.Factors, f => f.Name == "Scheme rule fit");
        Assert.Contains(analysis.Factors, f => f.Name == "Settlement state");
    }

    [Fact]
    public void InternalLedger_IsHighlyReversible()
    {
        var tx = Tx(PaymentProvider.InternalLedger, amount: 250m);
        var analysis = Engine().AnalyzeReversal(tx, 250m, new ReversalContext
        {
            ReasonHint = ReasonCode.ProcessingError
        });

        Assert.True(analysis.IsEligible);
        Assert.True(analysis.SuccessProbability >= 80, $"got {analysis.SuccessProbability}");
    }

    [Theory]
    [InlineData(ReasonCode.DuplicateCharge)]
    [InlineData(ReasonCode.Fraud)]
    [InlineData(ReasonCode.ProductNotReceived)]
    [InlineData(ReasonCode.WrongAmount)]
    public void Probability_AlwaysWithinBounds(ReasonCode hint)
    {
        var analysis = Engine().AnalyzeReversal(Tx(PaymentProvider.CardNetwork), 500m,
            new ReversalContext { ReasonHint = hint });

        Assert.InRange(analysis.SuccessProbability, 0, 100);
    }
}
