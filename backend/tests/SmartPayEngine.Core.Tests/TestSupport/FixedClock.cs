using SmartPayEngine.Core.Abstractions;

namespace SmartPayEngine.Core.Tests.TestSupport;

/// <summary>Deterministic <see cref="ISystemClock"/> for tests.</summary>
public sealed class FixedClock : ISystemClock
{
    public FixedClock(DateTimeOffset now) => UtcNow = now;

    public DateTimeOffset UtcNow { get; }
}
