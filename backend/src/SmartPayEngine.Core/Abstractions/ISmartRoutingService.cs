using SmartPayEngine.Core.Entities;
using SmartPayEngine.Core.Models;

namespace SmartPayEngine.Core.Abstractions;

/// <summary>
/// Evaluates the candidate payment rails for a transaction and ranks them.
/// </summary>
public interface ISmartRoutingService
{
    /// <summary>
    /// Analyze a transaction and return 3–5 ranked routing options (best-first)
    /// under the supplied <paramref name="policy"/> (defaults to balanced).
    /// </summary>
    RoutingRecommendation Analyze(Transaction transaction, RoutingPolicy? policy = null);

    /// <summary>
    /// Lower-level overload that routes a raw amount/corridor without a full
    /// transaction (useful pre-creation, e.g. quoting at checkout).
    /// </summary>
    RoutingRecommendation Analyze(
        ValueObjects.Money amount,
        Enums.Currency toCurrency,
        bool urgent = false,
        RoutingPolicy? policy = null);
}
