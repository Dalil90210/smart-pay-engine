using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Core.Models;

/// <summary>
/// A scored, ranked option for routing a payment. Returned by the
/// <see cref="Abstractions.ISmartRoutingService"/>.
/// </summary>
/// <param name="Provider">The provider / rail this option uses.</param>
/// <param name="ProviderName">Human-readable provider name.</param>
/// <param name="Cost">Total fee for this route (variable + flat).</param>
/// <param name="Speed">Estimated time to settle.</param>
/// <param name="SuccessRate">Estimated probability of clean settlement, [0, 1].</param>
/// <param name="Reversibility">How a payment on this route can be unwound.</param>
/// <param name="Score">Overall weighted desirability, [0, 1]; higher is better.</param>
/// <param name="Rationale">Short explanation of the trade-offs.</param>
public sealed record RoutingOption(
    PaymentProvider Provider,
    string ProviderName,
    Money Cost,
    TimeSpan Speed,
    double SuccessRate,
    ReversibilityModel Reversibility,
    double Score,
    string Rationale);

/// <summary>
/// The full result of routing analysis: a recommended option plus all ranked
/// alternatives and the policy weights that produced the ranking.
/// </summary>
public sealed record RoutingRecommendation(
    RoutingOption Recommended,
    IReadOnlyList<RoutingOption> Options,
    RoutingPolicy Policy);

/// <summary>
/// Weights expressing what the caller is optimizing for. Need not sum to 1; the
/// scorer normalizes them.
/// </summary>
/// <param name="Cost">Weight on minimizing fees.</param>
/// <param name="Speed">Weight on faster settlement.</param>
/// <param name="Reliability">Weight on clean-settlement probability.</param>
/// <param name="Reversibility">Weight on the ability to reverse later.</param>
public readonly record struct RoutingPolicy(
    double Cost,
    double Speed,
    double Reliability,
    double Reversibility)
{
    /// <summary>A balanced default weighting all four dimensions.</summary>
    public static RoutingPolicy Balanced { get; } = new(0.30, 0.25, 0.25, 0.20);

    /// <summary>Optimize primarily for the lowest cost.</summary>
    public static RoutingPolicy CheapestFirst { get; } = new(0.6, 0.15, 0.15, 0.10);

    /// <summary>Optimize primarily for speed.</summary>
    public static RoutingPolicy FastestFirst { get; } = new(0.15, 0.6, 0.15, 0.10);
}
