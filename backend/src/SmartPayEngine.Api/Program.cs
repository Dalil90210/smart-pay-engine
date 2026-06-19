using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using SmartPayEngine.Infrastructure;
using SmartPayEngine.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

// Serialize enums as strings (e.g. "USD", "CardNetwork") in/out of the API.
builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Register Core + Infrastructure services (routing service, reversal engine,
// clock, transaction store).
builder.Services.AddSmartPayEngine();

// Persistence for reversal requests: SQLite via EF Core when a connection string
// is configured, otherwise the in-memory sandbox store. Either way, the Core and
// Api layers are identical.
var connectionString = builder.Configuration.GetConnectionString("SmartPay");
var useSqlite = !string.IsNullOrWhiteSpace(connectionString);
if (useSqlite)
{
    builder.Services.AddSqlitePersistence(connectionString!);
}
else
{
    builder.Services.AddInMemoryPersistence();
}

var app = builder.Build();

// Apply EF Core migrations at startup so the schema is ready in the sandbox.
if (useSqlite)
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<SmartPayDbContext>();
    db.Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();

/// <summary>Exposed so the API can be referenced by a WebApplicationFactory in tests.</summary>
public partial class Program;
