using SmartPayEngine.Core.Entities;
using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.Models;
using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Core.Abstractions;

/// <summary>
/// The flagship reversal-intelligence service. Given a transaction and a
/// requested amount it produces a rich, explainable <see cref="ReversalAnalysis"/>.
/// </summary>
public interface IIntelligentReversalEngine
{
    /// <summary>
    /// Analyze whether (and how) a transaction should be reversed.
    /// </summary>
    /// <param name="transaction">The transaction under dispute.</param>
    /// <param name="requestedAmount">
    /// The amount the customer wants back (must be 0 &lt; x ≤ transaction amount).
    /// </param>
    /// <param name="context">
    /// Optional contextual signals (available evidence, reason hint, customer
    /// profile) that sharpen the analysis.
    /// </param>
    ReversalAnalysis AnalyzeReversal(
        Transaction transaction,
        decimal requestedAmount,
        ReversalContext? context = null);
}

/// <summary>
/// Optional signals the caller can supply to improve the analysis. All members
/// are optional; the engine degrades gracefully when they are absent.
/// </summary>
public sealed record ReversalContext
{
    /// <summary>Evidence the customer already holds or can readily provide.</summary>
    public IReadOnlyList<EvidenceType> AvailableEvidence { get; init; } = Array.Empty<EvidenceType>();

    /// <summary>A customer-asserted reason that biases (not forces) ranking.</summary>
    public ReasonCode? ReasonHint { get; init; }

    /// <summary>Strong objective signal that a duplicate exists in the ledger.</summary>
    public bool ObservedDuplicate { get; init; }

    /// <summary>The customer's standing, if known.</summary>
    public CustomerRiskProfile? Customer { get; init; }
}
