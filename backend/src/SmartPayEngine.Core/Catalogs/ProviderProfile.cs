using SmartPayEngine.Core.Enums;

namespace SmartPayEngine.Core.Catalogs;

/// <summary>
/// Static economic + behavioural profile of a <see cref="PaymentProvider"/>.
/// This is the single source of truth both the routing service and the reversal
/// engine consume, so rail economics live in exactly one place.
/// </summary>
/// <param name="Provider">The provider this profile describes.</param>
/// <param name="DisplayName">Human-readable name.</param>
/// <param name="Reversibility">How funds can be unwound after settlement.</param>
/// <param name="SupportedCurrencies">Currencies the rail can natively carry.</param>
/// <param name="SettlementTime">Typical time to settle (TimeSpan.Zero = instant).</param>
/// <param name="VariableCostBps">Variable cost in basis points (1bp = 0.01%).</param>
/// <param name="FlatFee">Flat fee applied once per payment, in the txn currency.</param>
/// <param name="Reliability">Probability of clean settlement, [0, 1].</param>
/// <param name="BaseReversalSuccess">
/// Baseline probability a well-founded reversal succeeds on this rail, [0, 1].
/// </param>
/// <param name="ReversalWindow">
/// Hard deadline (from settlement) to initiate a reversal; <c>null</c> = none.
/// </param>
public sealed record ProviderProfile(
    PaymentProvider Provider,
    string DisplayName,
    ReversibilityModel Reversibility,
    IReadOnlySet<Currency> SupportedCurrencies,
    TimeSpan SettlementTime,
    decimal VariableCostBps,
    decimal FlatFee,
    double Reliability,
    double BaseReversalSuccess,
    TimeSpan? ReversalWindow)
{
    /// <summary>Whether the rail can natively carry <paramref name="currency"/>.</summary>
    public bool Supports(Currency currency) => SupportedCurrencies.Contains(currency);
}
