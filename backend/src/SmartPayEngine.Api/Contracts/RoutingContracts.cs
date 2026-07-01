using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.Models;
using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Api.Contracts;

/// <summary>The optimization profile to rank routes against.</summary>
public enum RoutingPreference
{
    Balanced,
    CheapestFirst,
    FastestFirst
}

/// <summary>Body of POST /api/routing/analyze.</summary>
public sealed record RoutingRequest
{
    public required decimal Amount { get; init; }
    public required Currency FromCurrency { get; init; }
    public required Currency ToCurrency { get; init; }
    public bool Urgent { get; init; }
    public RoutingPreference Preference { get; init; } = RoutingPreference.Balanced;

    public Money ToMoney() => new(Amount, FromCurrency);

    public RoutingPolicy ToPolicy() => Preference switch
    {
        RoutingPreference.CheapestFirst => RoutingPolicy.CheapestFirst,
        RoutingPreference.FastestFirst => RoutingPolicy.FastestFirst,
        _ => RoutingPolicy.Balanced
    };
}
