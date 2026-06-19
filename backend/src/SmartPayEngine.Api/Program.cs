using System.Text.Json.Serialization;
using SmartPayEngine.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Serialize enums as strings (e.g. "USD", "CardNetwork") in/out of the API.
builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Register Core + Infrastructure services (routing service, reversal engine,
// repositories, clock).
builder.Services.AddSmartPayEngine();

var app = builder.Build();

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
