using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Catalogs;
using SmartPayEngine.Core.Common;
using SmartPayEngine.Core.Entities;
using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.Exceptions;
using SmartPayEngine.Core.Models;
using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Core.Services;

/// <summary>
/// Scores every eligible payment rail for a transaction across four dimensions
/// (cost, speed, reliability, reversibility) and returns a ranked list plus the
/// winner. The weighting is policy-driven so callers can optimize for cost,
/// speed, or a balanced blend.
/// </summary>
public sealed class SmartRoutingService : ISmartRoutingService
{
    /// <summary>Number of options returned (top-N after ranking).</summary>
    private const int MaxOptions = 5;

    /// <summary>Settlement time (hours) at which the speed score bottoms out.</summary>
    private const double SlowestSettlementHours = 96;

    public RoutingRecommendation Analyze(Transaction transaction, RoutingPolicy? policy = null)
        => Route(transaction.Amount, transaction.ToCurrency, urgent: false, policy);

    public RoutingRecommendation Analyze(
        Money amount,
        Currency toCurrency,
        bool urgent = false,
        RoutingPolicy? policy = null)
        => Route(amount, toCurrency, urgent, policy);

    private RoutingRecommendation Route(
        Money amount,
        Currency toCurrency,
        bool urgent,
        RoutingPolicy? policy)
    {
        if (amount.IsZero)
        {
            throw new DomainException("Routing requires a positive amount.", nameof(amount));
        }

        var resolvedPolicy = policy ?? RoutingPolicy.Balanced;
        var routes = PaymentRoute.AvailableFor(amount.Currency, toCurrency);
        if (routes.Count == 0)
        {
            throw new DomainException(
                $"No payment rail supports {amount.Currency} → {toCurrency}.",
                nameof(toCurrency));
        }

        // Pre-compute the fee range so the cost dimension can be normalized
        // (cheapest route scores 1, dearest scores 0).
        var fees = routes.ToDictionary(r => r.Provider, r => FeeFor(r.Profile, amount));
        var cheapest = new Money(fees.Values.Min(f => f.Amount), amount.Currency);
        var dearest = new Money(fees.Values.Max(f => f.Amount), amount.Currency);

        var options = routes
            .Select(r => Evaluate(r.Profile, amount, fees[r.Provider], cheapest, dearest, urgent, resolvedPolicy))
            .OrderByDescending(o => o.Score)
            .Take(MaxOptions)
            .ToList();

        return new RoutingRecommendation(options[0], options, resolvedPolicy);
    }

    /// <summary>Total fee = variable (bps) + flat, in the amount's currency.</summary>
    private static Money FeeFor(ProviderProfile profile, Money amount)
    {
        var variable = amount.Amount * profile.VariableCostBps / 10_000m;
        return new Money(variable + profile.FlatFee, amount.Currency);
    }

    private static RoutingOption Evaluate(
        ProviderProfile profile,
        Money amount,
        Money fee,
        Money cheapest,
        Money dearest,
        bool urgent,
        RoutingPolicy policy)
    {
        // Cost: cheapest = 1, dearest = 0.
        var costScore = dearest.Amount == cheapest.Amount
            ? 1.0
            : 1.0 - Scoring.Lerp((double)fee.Amount, (double)cheapest.Amount, (double)dearest.Amount, 0, 1);

        // Speed: instant = 1, decaying to 0 by ~96h. Urgency sharpens the curve.
        var speedBase = 1.0 - Scoring.Lerp(profile.SettlementTime.TotalHours, 0, SlowestSettlementHours, 0, 1);
        var speedScore = urgent ? Math.Sqrt(speedBase) : speedBase;

        var reliabilityScore = Scoring.Clamp(profile.Reliability, 0, 1);
        var reversibilityScore = Scoring.Clamp(profile.BaseReversalSuccess, 0, 1);

        var score = Scoring.WeightedAverage(new[]
        {
            new ScoreFactor("cost", costScore, policy.Cost, string.Empty),
            new ScoreFactor("speed", speedScore, policy.Speed, string.Empty),
            new ScoreFactor("reliability", reliabilityScore, policy.Reliability, string.Empty),
            new ScoreFactor("reversibility", reversibilityScore, policy.Reversibility, string.Empty)
        });

        var rationale =
            $"{profile.DisplayName}: fee {fee}, ~{FormatDuration(profile.SettlementTime)} to settle, " +
            $"{profile.Reliability:P0} reliability, {profile.Reversibility} reversibility.";

        return new RoutingOption(
            profile.Provider,
            profile.DisplayName,
            fee,
            profile.SettlementTime,
            reliabilityScore,
            profile.Reversibility,
            Math.Round(score, 4),
            rationale);
    }

    private static string FormatDuration(TimeSpan span)
        => span == TimeSpan.Zero ? "instant" : $"{span.TotalHours:0}h";
}
