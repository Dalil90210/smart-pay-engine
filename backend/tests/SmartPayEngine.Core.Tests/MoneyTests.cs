using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.Exceptions;
using SmartPayEngine.Core.ValueObjects;
using Xunit;

namespace SmartPayEngine.Core.Tests;

public class MoneyTests
{
    [Fact]
    public void Constructor_RoundsToTwoDecimals()
    {
        var money = new Money(10.005m, Currency.USD);
        Assert.Equal(10.00m, money.Amount); // bankers' rounding of .005 → .00
    }

    [Fact]
    public void Constructor_RejectsNegativeAmount()
    {
        Assert.Throws<DomainException>(() => new Money(-1m, Currency.USD));
    }

    [Fact]
    public void Add_DifferentCurrencies_Throws()
    {
        var usd = new Money(10m, Currency.USD);
        var eur = new Money(10m, Currency.EUR);
        Assert.Throws<DomainException>(() => usd.Add(eur));
    }

    [Fact]
    public void Percentage_ScalesAmount()
    {
        var half = new Money(100m, Currency.GBP).Percentage(0.5m);
        Assert.Equal(50m, half.Amount);
    }

    [Fact]
    public void Comparison_Operators_Work()
    {
        var a = new Money(100m, Currency.USD);
        var b = new Money(60m, Currency.USD);
        Assert.True(a > b);
        Assert.True(b < a);
    }
}
