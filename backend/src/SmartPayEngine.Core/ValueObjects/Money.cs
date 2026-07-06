using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.Exceptions;

namespace SmartPayEngine.Core.ValueObjects;

/// <summary>
/// Immutable money value object: a non-negative <see cref="decimal"/> amount
/// paired with a <see cref="Currency"/>. <c>decimal</c> (not <c>double</c>) is
/// used to avoid binary floating-point rounding errors on monetary values.
///
/// Arithmetic across different currencies throws — the domain must never
/// silently add USD to EUR. Use the routing/FX layer for conversions.
/// </summary>
public readonly record struct Money
{
    /// <summary>The monetary amount, always rounded to 2 decimal places.</summary>
    public decimal Amount { get; }

    public Currency Currency { get; }

    public Money(decimal amount, Currency currency)
    {
        if (amount < 0)
        {
            throw new DomainException("Money amount cannot be negative.", nameof(amount));
        }

        // Bankers' rounding keeps long-run sums unbiased.
        Amount = Math.Round(amount, 2, MidpointRounding.ToEven);
        Currency = currency;
    }

    /// <summary>A zero amount in the given currency.</summary>
    public static Money Zero(Currency currency) => new(0m, currency);

    public bool IsZero => Amount == 0m;

    private void EnsureSameCurrency(Money other)
    {
        if (other.Currency != Currency)
        {
            throw new DomainException(
                $"Currency mismatch: {Currency} vs {other.Currency}.",
                nameof(Currency));
        }
    }

    public Money Add(Money other)
    {
        EnsureSameCurrency(other);
        return new Money(Amount + other.Amount, Currency);
    }

    public Money Subtract(Money other)
    {
        EnsureSameCurrency(other);
        return new Money(Amount - other.Amount, Currency);
    }

    /// <summary>Scale by a ratio (e.g. 0.5 for half), rounding to 2 dp.</summary>
    public Money Percentage(decimal ratio) => new(Amount * ratio, Currency);

    /// <summary>Ratio of this amount to <paramref name="other"/>; 0 if other is 0.</summary>
    public decimal RatioTo(Money other)
    {
        EnsureSameCurrency(other);
        return other.Amount == 0m ? 0m : Amount / other.Amount;
    }

    public static Money operator +(Money a, Money b) => a.Add(b);

    public static Money operator -(Money a, Money b) => a.Subtract(b);

    public static bool operator >(Money a, Money b)
    {
        a.EnsureSameCurrency(b);
        return a.Amount > b.Amount;
    }

    public static bool operator <(Money a, Money b)
    {
        a.EnsureSameCurrency(b);
        return a.Amount < b.Amount;
    }

    public static bool operator >=(Money a, Money b) => a > b || a == b;

    public static bool operator <=(Money a, Money b) => a < b || a == b;

    public override string ToString() => $"{Amount:0.00} {Currency}";
}
