using SmartPayEngine.Core.Enums;

namespace SmartPayEngine.Core.Catalogs;

/// <summary>
/// The catalogue of <see cref="ProviderProfile"/>s. The figures are realistic
/// sandbox approximations (card chargeback ~120 days, ACH return ~60 days, SEPA
/// recall ~13 weeks, push payments effectively irreversible, internal book
/// transfers fully reversible).
/// </summary>
public static class ProviderCatalog
{
    private static IReadOnlySet<Currency> Set(params Currency[] currencies)
        => new HashSet<Currency>(currencies);

    private static readonly IReadOnlyDictionary<PaymentProvider, ProviderProfile> Profiles =
        new Dictionary<PaymentProvider, ProviderProfile>
        {
            [PaymentProvider.InternalLedger] = new(
                PaymentProvider.InternalLedger,
                "Internal book transfer",
                ReversibilityModel.BookReversal,
                Set(Currency.USD, Currency.EUR, Currency.GBP, Currency.NGN, Currency.KES, Currency.ZAR, Currency.CAD),
                TimeSpan.Zero,
                VariableCostBps: 0m,
                FlatFee: 0m,
                Reliability: 1.0,
                BaseReversalSuccess: 0.99,
                ReversalWindow: null),

            [PaymentProvider.CardNetwork] = new(
                PaymentProvider.CardNetwork,
                "Card network",
                ReversibilityModel.Chargeback,
                Set(Currency.USD, Currency.EUR, Currency.GBP, Currency.CAD, Currency.ZAR),
                TimeSpan.FromHours(48),
                VariableCostBps: 290m,
                FlatFee: 0.30m,
                Reliability: 0.98,
                BaseReversalSuccess: 0.82,
                ReversalWindow: TimeSpan.FromDays(120)),

            [PaymentProvider.Ach] = new(
                PaymentProvider.Ach,
                "ACH transfer",
                ReversibilityModel.Return,
                Set(Currency.USD),
                TimeSpan.FromHours(72),
                VariableCostBps: 25m,
                FlatFee: 0.25m,
                Reliability: 0.97,
                BaseReversalSuccess: 0.55,
                ReversalWindow: TimeSpan.FromDays(60)),

            [PaymentProvider.Sepa] = new(
                PaymentProvider.Sepa,
                "SEPA Credit Transfer",
                ReversibilityModel.Recall,
                Set(Currency.EUR),
                TimeSpan.FromHours(24),
                VariableCostBps: 10m,
                FlatFee: 0.35m,
                Reliability: 0.99,
                BaseReversalSuccess: 0.32,
                ReversalWindow: TimeSpan.FromDays(91)),

            [PaymentProvider.FasterPayments] = new(
                PaymentProvider.FasterPayments,
                "Faster Payments",
                ReversibilityModel.Recall,
                Set(Currency.GBP),
                TimeSpan.Zero,
                VariableCostBps: 5m,
                FlatFee: 0.20m,
                Reliability: 0.99,
                BaseReversalSuccess: 0.30,
                ReversalWindow: null),

            [PaymentProvider.SwiftWire] = new(
                PaymentProvider.SwiftWire,
                "SWIFT wire",
                ReversibilityModel.Recall,
                Set(Currency.USD, Currency.EUR, Currency.GBP, Currency.CAD, Currency.ZAR, Currency.KES, Currency.NGN),
                TimeSpan.FromHours(96),
                VariableCostBps: 60m,
                FlatFee: 15.00m,
                Reliability: 0.95,
                BaseReversalSuccess: 0.18,
                ReversalWindow: null),

            [PaymentProvider.Wise] = new(
                PaymentProvider.Wise,
                "Wise",
                ReversibilityModel.Recall,
                Set(Currency.USD, Currency.EUR, Currency.GBP, Currency.NGN, Currency.KES, Currency.ZAR, Currency.CAD),
                TimeSpan.FromHours(12),
                VariableCostBps: 45m,
                FlatFee: 0.50m,
                Reliability: 0.98,
                BaseReversalSuccess: 0.40,
                ReversalWindow: TimeSpan.FromDays(30)),

            [PaymentProvider.Paystack] = new(
                PaymentProvider.Paystack,
                "Paystack",
                ReversibilityModel.Chargeback,
                Set(Currency.NGN, Currency.KES, Currency.ZAR),
                TimeSpan.FromHours(24),
                VariableCostBps: 150m,
                FlatFee: 0.00m,
                Reliability: 0.96,
                BaseReversalSuccess: 0.6,
                ReversalWindow: TimeSpan.FromDays(45)),

            [PaymentProvider.Flutterwave] = new(
                PaymentProvider.Flutterwave,
                "Flutterwave",
                ReversibilityModel.Chargeback,
                Set(Currency.NGN, Currency.KES, Currency.ZAR, Currency.USD),
                TimeSpan.FromHours(24),
                VariableCostBps: 140m,
                FlatFee: 0.00m,
                Reliability: 0.95,
                BaseReversalSuccess: 0.55,
                ReversalWindow: TimeSpan.FromDays(45))
        };

    /// <summary>Look up the profile for a provider.</summary>
    public static ProviderProfile For(PaymentProvider provider) => Profiles[provider];

    /// <summary>All known provider profiles.</summary>
    public static IReadOnlyCollection<ProviderProfile> All => Profiles.Values.ToList();

    /// <summary>Providers able to carry the given currency.</summary>
    public static IReadOnlyCollection<ProviderProfile> ForCurrency(Currency currency)
        => Profiles.Values.Where(p => p.Supports(currency)).ToList();
}
