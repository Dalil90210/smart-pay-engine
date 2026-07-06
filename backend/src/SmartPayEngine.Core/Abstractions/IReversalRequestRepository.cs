using SmartPayEngine.Core.Entities;

namespace SmartPayEngine.Core.Abstractions;

/// <summary>Persistence boundary for <see cref="ReversalRequest"/> aggregates.</summary>
public interface IReversalRequestRepository
{
    Task<ReversalRequest> AddAsync(ReversalRequest request, CancellationToken ct = default);

    Task<ReversalRequest?> GetByIdAsync(Guid id, CancellationToken ct = default);

    Task<IReadOnlyList<ReversalRequest>> ListAsync(CancellationToken ct = default);

    /// <summary>Persist mutations to an already-tracked/known request.</summary>
    Task UpdateAsync(ReversalRequest request, CancellationToken ct = default);
}
