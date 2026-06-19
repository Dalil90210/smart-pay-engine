using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.Models;
using SmartPayEngine.Core.Services;
using SmartPayEngine.Core.ValueObjects;
using Xunit;

namespace SmartPayEngine.Core.Tests;

public class SmartRoutingServiceTests
{
    private static readonly SmartRoutingService Service = new();

    [Fact]
    public void Analyze_ReturnsRankedOptions_BestFirst()
    {
        var recommendation = Service.Analyze(new Money(1000m, Currency.USD), Currency.USD);

        Assert.NotEmpty(recommendation.Options);
        Assert.True(recommendation.Options.Count <= 5);

        // Options must be sorted by descending score.
        for (var i = 1; i < recommendation.Options.Count; i++)
        {
            Assert.True(recommendation.Options[i - 1].Score >= recommendation.Options[i].Score);
        }

        Assert.Equal(recommendation.Recommended, recommendation.Options[0]);
    }

    [Fact]
    public void CheapestPolicy_PrefersLowerFee()
    {
        var rec = Service.Analyze(
            new Money(5000m, Currency.USD),
            Currency.USD,
            urgent: false,
            RoutingPolicy.CheapestFirst);

        // Internal book transfer is free, so it should win on a cost-first policy.
        Assert.Equal(PaymentProvider.InternalLedger, rec.Recommended.Provider);
    }

    [Fact]
    public void OnlyProvidersSupportingCurrency_AreConsidered()
    {
        var rec = Service.Analyze(new Money(1000m, Currency.NGN), Currency.NGN);
        Assert.All(rec.Options, o => Assert.NotEqual(PaymentProvider.Sepa, o.Provider));
    }

    [Fact]
    public void ZeroAmount_Throws()
    {
        Assert.Throws<SmartPayEngine.Core.Exceptions.DomainException>(
            () => Service.Analyze(new Money(0m, Currency.USD), Currency.USD));
    }

    [Fact]
    public void FastestPolicy_PrefersInstantRail()
    {
        var rec = Service.Analyze(
            new Money(1000m, Currency.GBP),
            Currency.GBP,
            urgent: true,
            RoutingPolicy.FastestFirst);

        // Both Internal and Faster Payments settle instantly; the winner must.
        Assert.Equal(TimeSpan.Zero, rec.Recommended.Speed);
    }

    [Fact]
    public void EveryOption_HasNonEmptyRationale_AndBoundedScore()
    {
        var rec = Service.Analyze(new Money(2500m, Currency.USD), Currency.USD);
        Assert.All(rec.Options, o =>
        {
            Assert.False(string.IsNullOrWhiteSpace(o.Rationale));
            Assert.InRange(o.Score, 0.0, 1.0);
        });
    }

    [Fact]
    public void Policy_IsEchoedBack()
    {
        var rec = Service.Analyze(
            new Money(1000m, Currency.USD), Currency.USD, urgent: false, RoutingPolicy.CheapestFirst);
        Assert.Equal(RoutingPolicy.CheapestFirst, rec.Policy);
    }
}
