using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Core.Common;

/// <summary>
/// Dependency-free numeric helpers shared by the scoring models. Kept in one
/// place so the service logic reads declaratively.
/// </summary>
public static class Scoring
{
    /// <summary>Clamp <paramref name="value"/> into [<paramref name="min"/>, <paramref name="max"/>].</summary>
    public static double Clamp(double value, double min, double max)
        => double.IsNaN(value) ? min : Math.Min(max, Math.Max(min, value));

    /// <summary>Clamp into the probability percentage range [0, 100] and round.</summary>
    public static int ClampPercent(double value) => (int)Math.Round(Clamp(value, 0, 100));

    /// <summary>
    /// Linearly map <paramref name="value"/> from [inMin, inMax] to
    /// [outMin, outMax], clamped to the output range.
    /// </summary>
    public static double Lerp(double value, double inMin, double inMax, double outMin, double outMax)
    {
        if (inMax <= inMin)
        {
            return outMin;
        }

        var t = Clamp((value - inMin) / (inMax - inMin), 0, 1);
        return outMin + t * (outMax - outMin);
    }

    /// <summary>
    /// Combine weighted factors into a single [0, 1] score via a normalized
    /// weighted average. Factors with non-positive weight are ignored.
    /// </summary>
    public static double WeightedAverage(IReadOnlyCollection<ScoreFactor> factors)
    {
        var usable = factors.Where(f => f.Weight > 0).ToList();
        var totalWeight = usable.Sum(f => f.Weight);
        if (totalWeight <= 0)
        {
            return 0;
        }

        var weighted = usable.Sum(f => Clamp(f.Score, 0, 1) * f.Weight);
        return weighted / totalWeight;
    }
}
