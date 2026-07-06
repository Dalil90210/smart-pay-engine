namespace SmartPayEngine.Core.Abstractions;

/// <summary>
/// Abstraction over "now" so time-dependent logic (reversal windows, ageing)
/// is deterministic and unit-test friendly. Inject a fake in tests.
/// </summary>
public interface ISystemClock
{
    DateTimeOffset UtcNow { get; }
}
