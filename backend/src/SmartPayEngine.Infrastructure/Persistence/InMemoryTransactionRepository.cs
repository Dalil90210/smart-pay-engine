using System.Collections.Concurrent;
using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Entities;

namespace SmartPayEngine.Infrastructure.Persistence;

/// <summary>
/// Thread-safe in-memory <see cref="ITransactionRepository"/> for the sandbox.
/// Transactions are upstream records the engine reasons about; persisting them
/// to a relational store is intentionally out of scope here.
/// </summary>
public sealed class InMemoryTransactionRepository : ITransactionRepository
{
    private readonly ConcurrentDictionary<Guid, Transaction> _store = new();

    public Task<Transaction> AddAsync(Transaction transaction, CancellationToken ct = default)
    {
        _store[transaction.Id] = transaction;
        return Task.FromResult(transaction);
    }

    public Task<Transaction?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => Task.FromResult(_store.GetValueOrDefault(id));

    public Task<IReadOnlyList<Transaction>> ListAsync(CancellationToken ct = default)
    {
        IReadOnlyList<Transaction> all = _store.Values
            .OrderByDescending(t => t.CreatedAt)
            .ToList();
        return Task.FromResult(all);
    }
}
