using SmartPayEngine.Core.Catalogs;
using SmartPayEngine.Core.Enums;
using Xunit;

namespace SmartPayEngine.Core.Tests;

public class NetworkReversalRulesTests
{
    [Fact]
    public void Chargeback_StronglySupportsUnauthorized()
    {
        var card = NetworkReversalRules.Multiplier(ReversibilityModel.Chargeback, ReasonCode.Unauthorized);
        var recall = NetworkReversalRules.Multiplier(ReversibilityModel.Recall, ReasonCode.Unauthorized);

        Assert.True(card > recall);
        Assert.True(card >= 1.0);
    }

    [Fact]
    public void Recall_WeaklySupportsNotAsDescribed()
    {
        var m = NetworkReversalRules.Multiplier(ReversibilityModel.Recall, ReasonCode.ProductNotAsDescribed);
        Assert.True(m < 0.6);
    }

    [Fact]
    public void BookReversal_SupportsEverything()
    {
        foreach (var code in Enum.GetValues<ReasonCode>())
        {
            var m = NetworkReversalRules.Multiplier(ReversibilityModel.BookReversal, code);
            Assert.True(m >= 1.0, $"{code} on BookReversal was {m}");
        }
    }

    [Fact]
    public void Describe_ProducesReadableVerdict()
    {
        var text = NetworkReversalRules.Describe(ReversibilityModel.Chargeback, ReasonCode.Fraud);
        Assert.Contains("Fraud", text);
        Assert.Contains("supported", text);
    }
}
