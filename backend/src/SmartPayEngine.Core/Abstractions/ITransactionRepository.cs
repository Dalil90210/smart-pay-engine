using SmartPayEngine.Core.Entities;

namespace SmartPayEngine.Core.Abstractions;

/// <summary>Persistence boundary for <see cref="Transaction"/> records.</summary>
public interface ITransactionRepository
{
    Task<Transaction> AddAsync(Transaction transaction, CancellationToken ct = default);

    Task<Transaction?> GetByIdAsync(Guid id, CancellationToken ct = default);

    Task<IReadOnlyList<Transaction>> ListAsync(CancellationToken ct = default);
}
