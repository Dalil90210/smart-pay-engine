using SmartPayEngine.Core.Catalogs;
using SmartPayEngine.Core.Enums;

namespace SmartPayEngine.Core.Entities;

/// <summary>
/// A concrete payment corridor: a provider carrying funds between two
/// currencies. Bundles the static <see cref="ProviderProfile"/> with the
/// corridor context so the routing service can score it.
/// </summary>
public sealed class PaymentRoute
{
    public PaymentProvider Provider { get; }

    public Currency FromCurrency { get; }

    public Currency ToCurrency { get; }

    public ProviderProfile Profile { get; }

    private PaymentRoute(
        PaymentProvider provider,
        Currency fromCurrency,
        Currency toCurrency,
        ProviderProfile profile)
    {
        Provider = provider;
        FromCurrency = fromCurrency;
        ToCurrency = toCurrency;
        Profile = profile;
    }

    /// <summary>True when the corridor crosses currencies (FX required).</summary>
    public bool IsCrossCurrency => FromCurrency != ToCurrency;

    /// <summary>
    /// Build the set of viable routes for a currency corridor — every provider
    /// that supports both the source and destination currencies.
    /// </summary>
    public static IReadOnlyList<PaymentRoute> AvailableFor(Currency from, Currency to)
        => ProviderCatalog.All
            .Where(p => p.Supports(from) && p.Supports(to))
            .Select(p => new PaymentRoute(p.Provider, from, to, p))
            .ToList();
}
