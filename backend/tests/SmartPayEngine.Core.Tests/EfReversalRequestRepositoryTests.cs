using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SmartPayEngine.Core.Entities;
using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.Models;
using SmartPayEngine.Core.ValueObjects;
using SmartPayEngine.Infrastructure.Persistence;
using Xunit;

namespace SmartPayEngine.Core.Tests;

/// <summary>
/// Round-trips a <see cref="ReversalRequest"/> through EF Core against a real
/// (in-memory) SQLite database, exercising the value converters for
/// <see cref="Money"/> and the evidence list as well as constructor binding.
/// </summary>
public class EfReversalRequestRepositoryTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly DbContextOptions<SmartPayDbContext> _options;

    public EfReversalRequestRepositoryTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
        _options = new DbContextOptionsBuilder<SmartPayDbContext>()
            .UseSqlite(_connection)
            .Options;

        using var ctx = new SmartPayDbContext(_options);
        ctx.Database.EnsureCreated();
    }

    private SmartPayDbContext NewContext() => new(_options);

    private static ReversalRequest Sample()
    {
        var analysis = new ReversalAnalysis
        {
            TransactionId = Guid.NewGuid(),
            IsEligible = true,
            SuccessProbability = 88,
            Confidence = ConfidenceLevel.High,
            ConfidenceScore = 0.8,
            RecommendedAction = RecommendedAction.FullReversal,
            RecommendedAmount = new Money(420.55m, Currency.EUR),
            EstimatedRecovery = new Money(370m, Currency.EUR),
            BestReasonCode = ReasonCode.DuplicateCharge,
            BestReasonLabel = "Duplicate charge",
            RankedReasonCodes = Array.Empty<RankedReasonCode>(),
            RequiredEvidence = new[] { EvidenceType.DuplicateChargeRecord, EvidenceType.BankStatement },
            SuggestedEvidence = Array.Empty<EvidenceType>(),
            Factors = Array.Empty<ScoreFactor>(),
            PriorityScore = 90,
            AIExplanation = "Strong duplicate-charge case."
        };
        return ReversalRequest.FromAnalysis(analysis, new Money(420.55m, Currency.EUR));
    }

    [Fact]
    public async Task Add_Then_Get_RoundTripsAllFields()
    {
        var request = Sample();

        await using (var ctx = NewContext())
        {
            var repo = new EfReversalRequestRepository(ctx);
            await repo.AddAsync(request);
        }

        await using (var ctx = NewContext())
        {
            var repo = new EfReversalRequestRepository(ctx);
            var loaded = await repo.GetByIdAsync(request.Id);

            Assert.NotNull(loaded);
            Assert.Equal(request.Id, loaded!.Id);
            Assert.Equal(request.TransactionId, loaded.TransactionId);
            Assert.Equal(new Money(420.55m, Currency.EUR), loaded.RequestedAmount);
            Assert.Equal(ReasonCode.DuplicateCharge, loaded.ReasonCode);
            Assert.Equal(88, loaded.SuccessProbability);
            Assert.Equal(
                new[] { EvidenceType.DuplicateChargeRecord, EvidenceType.BankStatement },
                loaded.EvidenceNeeded);
            Assert.Equal("Strong duplicate-charge case.", loaded.AIExplanation);
        }
    }

    [Fact]
    public async Task Update_PersistsStatusTransition()
    {
        var request = Sample();

        await using (var ctx = NewContext())
        {
            await new EfReversalRequestRepository(ctx).AddAsync(request);
        }

        await using (var ctx = NewContext())
        {
            var repo = new EfReversalRequestRepository(ctx);
            var loaded = await repo.GetByIdAsync(request.Id);
            loaded!.Approve();
            await repo.UpdateAsync(loaded);
        }

        await using (var ctx = NewContext())
        {
            var loaded = await new EfReversalRequestRepository(ctx).GetByIdAsync(request.Id);
            Assert.Equal(ReversalStatus.Approved, loaded!.Status);
        }
    }

    public void Dispose() => _connection.Dispose();
}
