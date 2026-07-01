using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Services;
using SmartPayEngine.Infrastructure.Persistence;
using SmartPayEngine.Infrastructure.Time;

namespace SmartPayEngine.Infrastructure;

/// <summary>
/// Composition root for the Core + Infrastructure services. Keeps the Api
/// project free of wiring details — it just calls <c>AddSmartPayEngine()</c> and
/// then one of the persistence registrations.
/// </summary>
public static class DependencyInjection
{
    /// <summary>
    /// Register the stateless domain services (clock, routing, reversal engine)
    /// and the in-memory transaction store. Persistence for reversal requests is
    /// registered separately via <see cref="AddInMemoryPersistence"/> or
    /// <see cref="AddSqlitePersistence"/>.
    /// </summary>
    public static IServiceCollection AddSmartPayEngine(this IServiceCollection services)
    {
        services.AddSingleton<ISystemClock, SystemClock>();
        services.AddSingleton<ISmartRoutingService, SmartRoutingService>();
        services.AddSingleton<IIntelligentReversalEngine, IntelligentReversalEngine>();
        services.AddSingleton<ITransactionRepository, InMemoryTransactionRepository>();
        return services;
    }

    /// <summary>Use the thread-safe in-memory reversal-request store (default).</summary>
    public static IServiceCollection AddInMemoryPersistence(this IServiceCollection services)
    {
        services.AddSingleton<IReversalRequestRepository, InMemoryReversalRequestRepository>();
        return services;
    }

    /// <summary>
    /// Use a SQLite-backed reversal-request store via EF Core. The Core and Api
    /// layers are untouched by this swap.
    /// </summary>
    public static IServiceCollection AddSqlitePersistence(this IServiceCollection services, string connectionString)
    {
        services.AddDbContext<SmartPayDbContext>(options => options.UseSqlite(connectionString));
        services.AddScoped<IReversalRequestRepository, EfReversalRequestRepository>();
        return services;
    }
}
