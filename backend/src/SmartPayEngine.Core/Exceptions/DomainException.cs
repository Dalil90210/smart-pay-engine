namespace SmartPayEngine.Core.Exceptions;

/// <summary>
/// Thrown when a domain invariant is violated (e.g. constructing a
/// <see cref="ValueObjects.Money"/> with a negative amount, or mixing
/// currencies). Application/API layers translate this into a 400-style result.
/// </summary>
public sealed class DomainException : Exception
{
    /// <summary>Optional field path the error relates to (e.g. "amount").</summary>
    public string? Field { get; }

    public DomainException(string message, string? field = null)
        : base(message)
    {
        Field = field;
    }
}
