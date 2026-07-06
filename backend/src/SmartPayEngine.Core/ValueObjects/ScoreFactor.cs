namespace SmartPayEngine.Core.ValueObjects;

/// <summary>
/// A single, transparent contribution to a composite score. The reversal engine
/// emits one of these per signal so the resulting probability is fully
/// explainable (every percentage point can be traced to a factor).
/// </summary>
/// <param name="Name">Human-readable factor name (surfaced in explanations).</param>
/// <param name="Score">Normalized score in [0, 1] for this factor.</param>
/// <param name="Weight">Relative importance; weights are normalized at combine time.</param>
/// <param name="Detail">Plain-language rationale for the score.</param>
public readonly record struct ScoreFactor(
    string Name,
    double Score,
    double Weight,
    string Detail);
