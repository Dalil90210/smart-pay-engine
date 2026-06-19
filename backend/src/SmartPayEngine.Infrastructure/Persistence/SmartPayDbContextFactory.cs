using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SmartPayEngine.Infrastructure.Persistence;

/// <summary>
/// Design-time factory so <c>dotnet ef migrations</c> can construct the context
/// without booting the whole API host.
/// </summary>
public sealed class SmartPayDbContextFactory : IDesignTimeDbContextFactory<SmartPayDbContext>
{
    public SmartPayDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<SmartPayDbContext>()
            .UseSqlite("Data Source=smartpay.db")
            .Options;

        return new SmartPayDbContext(options);
    }
}
