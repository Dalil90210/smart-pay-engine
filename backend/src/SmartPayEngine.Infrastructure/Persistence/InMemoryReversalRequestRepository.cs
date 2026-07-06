using System.Collections.Concurrent;
using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Entities;

namespace SmartPayEngine.Infrastructure.Persistence;

/// <summary>
/// Thread-safe in-memory <see cref="IReversalRequestRepository"/>. Suitable for
/// the sandbox / tests; swap for an EF Core or Supabase-backed implementation
/// in production without touching the Core or Api layers.
/// </summary>
public sealed class InMemoryReversalRequestRepository : IReversalRequestRepository
{
    private readonly ConcurrentDictionary<Guid, ReversalRequest> _store = new();

    public Task<ReversalRequest> AddAsync(ReversalRequest request, CancellationToken ct = default)
    {
        _store[request.Id] = request;
        return Task.FromResult(request);
    }

    public Task<ReversalRequest?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => Task.FromResult(_store.GetValueOrDefault(id));

    public Task<IReadOnlyList<ReversalRequest>> ListAsync(CancellationToken ct = default)
    {
        IReadOnlyList<ReversalRequest> all = _store.Values
            .OrderByDescending(r => r.PriorityScore)
            .ToList();
        return Task.FromResult(all);
    }

    public Task UpdateAsync(ReversalRequest request, CancellationToken ct = default)
    {
        _store[request.Id] = request;
        return Task.CompletedTask;
    }
}
