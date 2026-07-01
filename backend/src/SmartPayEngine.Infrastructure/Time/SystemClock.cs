using SmartPayEngine.Core.Abstractions;

namespace SmartPayEngine.Infrastructure.Time;

/// <summary>Production <see cref="ISystemClock"/> backed by the wall clock.</summary>
public sealed class SystemClock : ISystemClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
