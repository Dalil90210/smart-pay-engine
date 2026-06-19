using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SmartPayEngine.Core.Entities;
using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Infrastructure.Persistence;

/// <summary>
/// EF Core persistence context for the engine's aggregates. The domain entities
/// are intentionally framework-agnostic (private constructors, value objects),
/// so mapping is done here with explicit value converters rather than by
/// polluting the domain with EF attributes. EF Core binds the private
/// constructor by matching parameter names to properties.
/// </summary>
public sealed class SmartPayDbContext : DbContext
{
    public SmartPayDbContext(DbContextOptions<SmartPayDbContext> options) : base(options)
    {
    }

    public DbSet<ReversalRequest> ReversalRequests => Set<ReversalRequest>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Money <-> "amount|currency" so it survives as a single column while the
        // value object keeps its invariants on the way back in.
        var moneyConverter = new ValueConverter<Money, string>(
            m => $"{m.Amount.ToString(System.Globalization.CultureInfo.InvariantCulture)}|{m.Currency}",
            s => ParseMoney(s));

        // Evidence list <-> CSV of enum names; needs a comparer because it is a
        // reference-typed collection.
        var evidenceConverter = new ValueConverter<IReadOnlyList<EvidenceType>, string>(
            list => string.Join(',', list.Select(e => e.ToString())),
            s => ParseEvidence(s));

        var evidenceComparer = new ValueComparer<IReadOnlyList<EvidenceType>>(
            (a, b) => a!.SequenceEqual(b!),
            v => v.Aggregate(0, (acc, e) => HashCode.Combine(acc, e.GetHashCode())),
            v => v.ToList());

        modelBuilder.Entity<ReversalRequest>(entity =>
        {
            entity.ToTable("reversal_requests");
            entity.HasKey(r => r.Id);

            entity.Property(r => r.TransactionId).IsRequired();

            entity.Property(r => r.RequestedAmount)
                .HasConversion(moneyConverter)
                .HasColumnName("requested_amount")
                .IsRequired();

            entity.Property(r => r.Status).HasConversion<string>().IsRequired();
            entity.Property(r => r.SuccessProbability).IsRequired();
            entity.Property(r => r.RecommendedAction).HasConversion<string>().IsRequired();
            entity.Property(r => r.ReasonCode).HasConversion<string>().IsRequired();

            entity.Property(r => r.EvidenceNeeded)
                .HasConversion(evidenceConverter)
                .Metadata.SetValueComparer(evidenceComparer);

            entity.Property(r => r.AIExplanation).IsRequired();
            entity.Property(r => r.CreatedAt).IsRequired();

            entity.HasIndex(r => r.TransactionId);
            entity.HasIndex(r => r.Status);
        });
    }

    private static Money ParseMoney(string raw)
    {
        var parts = raw.Split('|');
        var amount = decimal.Parse(parts[0], System.Globalization.CultureInfo.InvariantCulture);
        var currency = Enum.Parse<Currency>(parts[1]);
        return new Money(amount, currency);
    }

    private static IReadOnlyList<EvidenceType> ParseEvidence(string raw)
        => string.IsNullOrWhiteSpace(raw)
            ? Array.Empty<EvidenceType>()
            : raw.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(Enum.Parse<EvidenceType>)
                .ToList();
}
