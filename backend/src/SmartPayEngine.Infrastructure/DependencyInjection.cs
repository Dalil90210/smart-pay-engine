using Microsoft.Extensions.DependencyInjection;
using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Services;
using SmartPayEngine.Infrastructure.Persistence;
using SmartPayEngine.Infrastructure.Time;

namespace SmartPayEngine.Infrastructure;

/// <summary>
/// Composition root for the Core + Infrastructure services. Keeps the Api
/// project free of wiring details — it just calls <c>AddSmartPayEngine()</c>.
/// </summary>
public static class DependencyInjection
{
    public static IServiceCollection AddSmartPayEngine(this IServiceCollection services)
    {
        // Time
        services.AddSingleton<ISystemClock, SystemClock>();

        // Core domain services (stateless → singletons).
        services.AddSingleton<ISmartRoutingService, SmartRoutingService>();
        services.AddSingleton<IIntelligentReversalEngine, IntelligentReversalEngine>();

        // Persistence (in-memory sandbox implementation).
        services.AddSingleton<IReversalRequestRepository, InMemoryReversalRequestRepository>();

        return services;
    }
}
