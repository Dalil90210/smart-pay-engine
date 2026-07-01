using Microsoft.EntityFrameworkCore;
using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Entities;

namespace SmartPayEngine.Infrastructure.Persistence;

/// <summary>
/// EF Core-backed <see cref="IReversalRequestRepository"/>. Drop-in replacement
/// for the in-memory implementation — the Core and Api layers are unaffected by
/// the swap. Ordering by priority is done in memory because
/// <see cref="ReversalRequest.PriorityScore"/> is a computed domain property,
/// not a mapped column.
/// </summary>
public sealed class EfReversalRequestRepository : IReversalRequestRepository
{
    private readonly SmartPayDbContext _db;

    public EfReversalRequestRepository(SmartPayDbContext db) => _db = db;

    public async Task<ReversalRequest> AddAsync(ReversalRequest request, CancellationToken ct = default)
    {
        await _db.ReversalRequests.AddAsync(request, ct);
        await _db.SaveChangesAsync(ct);
        return request;
    }

    public async Task<ReversalRequest?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => await _db.ReversalRequests.FirstOrDefaultAsync(r => r.Id == id, ct);

    public async Task<IReadOnlyList<ReversalRequest>> ListAsync(CancellationToken ct = default)
    {
        var all = await _db.ReversalRequests.AsNoTracking().ToListAsync(ct);
        return all.OrderByDescending(r => r.PriorityScore).ToList();
    }

    public async Task UpdateAsync(ReversalRequest request, CancellationToken ct = default)
    {
        _db.ReversalRequests.Update(request);
        await _db.SaveChangesAsync(ct);
    }
}
