namespace SmartPayEngine.Core.ValueObjects;

/// <summary>
/// Snapshot of a customer's standing at the time of analysis. Used by the
/// reversal engine to weigh trust vs. abuse. Defaults are deliberately neutral
/// so a sparsely-populated transaction still scores sensibly.
/// </summary>
public sealed record CustomerRiskProfile
{
    /// <summary>Account age in days. Older accounts are lower risk.</summary>
    public int AccountAgeDays { get; init; }

    /// <summary>Lifetime count of clean (non-reversed) transactions.</summary>
    public int PriorSuccessfulTransactions { get; init; }

    /// <summary>Reversals/chargebacks the customer has previously filed.</summary>
    public int PriorReversals { get; init; }

    /// <summary>Whether KYC/identity verification is complete.</summary>
    public bool KycVerified { get; init; }

    /// <summary>A neutral, unverified profile used when none is supplied.</summary>
    public static CustomerRiskProfile Unknown { get; } = new()
    {
        AccountAgeDays = 30,
        PriorSuccessfulTransactions = 0,
        PriorReversals = 0,
        KycVerified = false
    };
}
