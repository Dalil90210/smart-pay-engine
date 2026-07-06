namespace SmartPayEngine.Core.Enums;

/// <summary>
/// ISO-4217 currencies supported by the platform. Kept as an enum so the domain
/// can reason about currencies exhaustively (switch expressions, validation).
/// </summary>
public enum Currency
{
    /// <summary>United States dollar.</summary>
    USD,

    /// <summary>Euro.</summary>
    EUR,

    /// <summary>Pound sterling.</summary>
    GBP,

    /// <summary>Nigerian naira.</summary>
    NGN,

    /// <summary>Kenyan shilling.</summary>
    KES,

    /// <summary>South African rand.</summary>
    ZAR,

    /// <summary>Canadian dollar.</summary>
    CAD
}
