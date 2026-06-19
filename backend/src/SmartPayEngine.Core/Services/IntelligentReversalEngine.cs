using System.Text;
using SmartPayEngine.Core.Abstractions;
using SmartPayEngine.Core.Catalogs;
using SmartPayEngine.Core.Common;
using SmartPayEngine.Core.Entities;
using SmartPayEngine.Core.Enums;
using SmartPayEngine.Core.Exceptions;
using SmartPayEngine.Core.Models;
using SmartPayEngine.Core.ValueObjects;

namespace SmartPayEngine.Core.Services;

/// <summary>
/// The flagship Intelligent Reversal Engine.
///
/// Given a <see cref="Transaction"/> and a requested amount it produces a
/// <see cref="ReversalAnalysis"/>: a success probability, a full/partial/none/
/// manual-review recommendation, the best reason code, the evidence still
/// needed, a confidence level, and a detailed natural-language explanation.
///
/// The scoring is a transparent, weighted model — not a black box. Every signal
/// is captured as a <see cref="ScoreFactor"/> and echoed back in the
/// explanation, which matters for anything touching money. A real ML model
/// could later replace <see cref="ScoreFactors"/> without changing the public
/// contract. The engine is deterministic given an injected
/// <see cref="ISystemClock"/>, so it is trivially unit-testable.
/// </summary>
public sealed class IntelligentReversalEngine : IIntelligentReversalEngine
{
    private readonly ISystemClock _clock;

    public IntelligentReversalEngine(ISystemClock clock) => _clock = clock;

    /// <inheritdoc />
    public ReversalAnalysis AnalyzeReversal(
        Transaction transaction,
        decimal requestedAmount,
        ReversalContext? context = null)
    {
        ArgumentNullException.ThrowIfNull(transaction);
        var ctx = context ?? new ReversalContext();

        // --- 0) Validate the requested amount against the transaction. -------
        if (requestedAmount <= 0)
        {
            throw new DomainException("Requested amount must be greater than zero.", nameof(requestedAmount));
        }

        if (requestedAmount > transaction.Amount.Amount)
        {
            throw new DomainException(
                "Requested amount cannot exceed the transaction amount.",
                nameof(requestedAmount));
        }

        var currency = transaction.FromCurrency;
        var requested = new Money(requestedAmount, currency);
        var now = _clock.UtcNow;

        // --- 1) Hard eligibility gate (terminal status / window closed). -----
        if (!IsEligible(transaction, now, out var ineligibleReason))
        {
            return BuildIneligible(transaction, ineligibleReason);
        }

        // --- 2) Rank reason codes given the evidence we have. ----------------
        var available = new HashSet<EvidenceType>(ctx.AvailableEvidence);
        var ranked = RankReasonCodes(available, ctx);
        var best = SelectBest(ranked, ctx);
        var bestProfile = ReasonCodeCatalog.For(best.Code);

        // --- 3) Score the success probability from weighted factors. ---------
        var factors = ScoreFactors(transaction, best, ctx, now);
        var probability = Scoring.ClampPercent(Scoring.WeightedAverage(factors) * 100);

        // --- 4) Decide full / partial / none / manual-review + amount. -------
        var (action, recommendedAmount) =
            DecideAction(transaction, requested, bestProfile, probability, ctx);

        // --- 5) Evidence guidance. -------------------------------------------
        var requiredEvidence = bestProfile.RequiredEvidence.Where(e => !available.Contains(e)).ToList();
        var suggestedEvidence = bestProfile.StrengtheningEvidence
            .Where(e => !available.Contains(e) && !bestProfile.RequiredEvidence.Contains(e))
            .ToList();

        // --- 6) Confidence + priority + expected recovery. -------------------
        var confidenceScore = ScoreConfidence(transaction, available, bestProfile);
        var confidence = BucketConfidence(confidenceScore);
        var estimatedRecovery = recommendedAmount.Percentage((decimal)probability / 100m);
        var priority = Priority(probability, recommendedAmount);

        var analysis = new ReversalAnalysis
        {
            TransactionId = transaction.Id,
            IsEligible = true,
            SuccessProbability = probability,
            Confidence = confidence,
            ConfidenceScore = Math.Round(confidenceScore, 2),
            RecommendedAction = action,
            RecommendedAmount = recommendedAmount,
            EstimatedRecovery = estimatedRecovery,
            BestReasonCode = action == RecommendedAction.NoReversal ? null : best.Code,
            BestReasonLabel = action == RecommendedAction.NoReversal ? null : best.Label,
            RankedReasonCodes = ranked,
            RequiredEvidence = requiredEvidence,
            SuggestedEvidence = suggestedEvidence,
            Factors = factors,
            PriorityScore = priority,
            AIExplanation = string.Empty
        };

        // Explanation references the final values, so build it last.
        return analysis with { AIExplanation = Explain(transaction, analysis, best, now) };
    }

    // === Eligibility =========================================================

    private static bool IsEligible(Transaction tx, DateTimeOffset now, out string reason)
    {
        if (tx.IsTerminalForReversal)
        {
            reason = $"the transaction is already {tx.Status} and cannot be reversed again";
            return false;
        }

        var profile = ProviderCatalog.For(tx.RouteUsed);
        if (profile.ReversalWindow is { } window)
        {
            var elapsed = now - tx.ReversalAnchor;
            if (elapsed > window)
            {
                reason = $"the {profile.DisplayName} reversal window of {window.TotalDays:0} days has closed";
                return false;
            }
        }

        reason = string.Empty;
        return true;
    }

    // === Reason-code ranking =================================================

    /// <summary>
    /// Score & rank every reason code for the available evidence. The adjusted
    /// win rate penalizes missing required evidence heavily and rewards
    /// strengthening evidence modestly; a matching reason hint / duplicate
    /// signal biases the ranking.
    /// </summary>
    private static List<RankedReasonCode> RankReasonCodes(
        IReadOnlySet<EvidenceType> available,
        ReversalContext ctx)
    {
        return ReasonCodeCatalog.All
            .Select(profile =>
            {
                var required = profile.RequiredEvidence;
                var presentRequired = required.Count(available.Contains);
                var requiredRatio = required.Count == 0 ? 1.0 : (double)presentRequired / required.Count;

                var strengthening = profile.StrengtheningEvidence;
                var presentStrengthening = strengthening.Count(available.Contains);
                var strengtheningRatio = strengthening.Count == 0
                    ? 0.0
                    : (double)presentStrengthening / strengthening.Count;

                // Missing required evidence caps the rate to 40%–100% of base;
                // strengthening evidence adds up to +15%.
                var requiredFactor = 0.4 + 0.6 * requiredRatio;
                var strengtheningFactor = 0.85 + 0.15 * strengtheningRatio;
                var adjusted = profile.BaseWinRate * requiredFactor * strengtheningFactor;

                if (ctx.ObservedDuplicate && profile.Code == ReasonCode.DuplicateCharge)
                {
                    adjusted = Math.Max(adjusted, 0.9);
                }

                if (ctx.ReasonHint == profile.Code)
                {
                    adjusted += 0.05;
                }

                return new RankedReasonCode(
                    profile.Code,
                    profile.Label,
                    Math.Round(Scoring.Clamp(adjusted, 0, 1), 4),
                    required.Where(e => !available.Contains(e)).ToList());
            })
            .OrderByDescending(r => r.AdjustedWinRate)
            .ToList();
    }

    /// <summary>
    /// Pick the reason code to file under. When the customer asserts a reason
    /// (<see cref="ReversalContext.ReasonHint"/>) and it is at least minimally
    /// viable, honour it — the customer owns the dispute narrative. Otherwise
    /// fall back to the strongest evidence-adjusted code. The full ranked list
    /// is still returned for transparency either way.
    /// </summary>
    private const double MinViableHintWinRate = 0.30;

    private static RankedReasonCode SelectBest(
        IReadOnlyList<RankedReasonCode> ranked,
        ReversalContext ctx)
    {
        if (ctx.ReasonHint is { } hint)
        {
            var hinted = ranked.FirstOrDefault(r => r.Code == hint);
            if (hinted is not null && hinted.AdjustedWinRate >= MinViableHintWinRate)
            {
                return hinted;
            }
        }

        return ranked[0];
    }

    // === Probability factors =================================================

    /// <summary>
    /// The weighted-factor model behind the success probability. Each factor is
    /// normalized to [0, 1]; weights encode relative importance.
    /// </summary>
    private static List<ScoreFactor> ScoreFactors(
        Transaction tx,
        RankedReasonCode best,
        ReversalContext ctx,
        DateTimeOffset now)
    {
        var profile = ProviderCatalog.For(tx.RouteUsed);
        var customer = ctx.Customer ?? CustomerRiskProfile.Unknown;

        return new List<ScoreFactor>
        {
            // How reversible the rail is in the abstract (chargeback vs recall).
            new(
                "Rail reversibility",
                profile.BaseReversalSuccess,
                0.18,
                $"{profile.DisplayName} unwinds via {profile.Reversibility}."),

            // Whether the chosen reason code actually has standing on this rail's
            // rulebook — the scheme/network rules matrix.
            new(
                "Scheme rule fit",
                Scoring.Clamp(NetworkReversalRules.Multiplier(profile.Reversibility, best.Code), 0, 1),
                0.16,
                NetworkReversalRules.Describe(profile.Reversibility, best.Code)),

            // Evidence-adjusted strength of the reason code itself.
            new(
                "Reason code strength",
                best.AdjustedWinRate,
                0.18,
                $"Best code '{best.Label}' at {best.AdjustedWinRate:P0} adjusted win rate."),

            // Freshness relative to the rail's reversal window.
            new(
                "Timing",
                TimingScore(tx, now),
                0.12,
                TimingDetail(tx, now)),

            // Pre-settlement disputes can often be cancelled outright.
            new(
                "Settlement state",
                SettlementScore(tx),
                0.06,
                SettlementDetail(tx)),

            // Tenure / track record vs. reversal-abuse pattern.
            new(
                "Customer trust",
                CustomerScore(customer),
                0.10,
                CustomerDetail(customer)),

            // Upstream fraud/risk signal (banded; mid-band = friendly-fraud risk).
            new(
                "Fraud / risk signal",
                FraudScore(tx),
                0.08,
                $"Upstream risk score {tx.RiskScore}/100."),

            // Larger amounts attract more scrutiny.
            new(
                "Amount scrutiny",
                AmountScore(tx.Amount),
                0.06,
                $"Claim of {tx.Amount}."),

            // Counterparty channel + cross-currency recall friction + dispute history.
            new(
                "Counterparty & FX",
                CounterpartyScore(tx, ctx),
                0.06,
                CounterpartyDetail(tx, ctx))
        };
    }

    /// <summary>
    /// Pre-settlement transactions (Pending/Processing) can frequently be
    /// cancelled before funds leave, which is far easier than a post-settlement
    /// reversal; settled transactions sit at a neutral baseline.
    /// </summary>
    private static double SettlementScore(Transaction tx) => tx.Status switch
    {
        TransactionStatus.Pending => 0.97,
        TransactionStatus.Processing => 0.92,
        TransactionStatus.Completed => 0.82,
        TransactionStatus.PartiallyReversed => 0.60,
        _ => 0.5
    };

    private static string SettlementDetail(Transaction tx) => tx.Status switch
    {
        TransactionStatus.Pending or TransactionStatus.Processing =>
            $"{tx.Status}: pre-settlement, can likely be cancelled outright.",
        TransactionStatus.PartiallyReversed => "Already partially reversed; remaining balance only.",
        _ => $"{tx.Status}: post-settlement reversal."
    };

    /// <summary>Fresher disputes win more often; decays across the rail window.</summary>
    private static double TimingScore(Transaction tx, DateTimeOffset now)
    {
        var profile = ProviderCatalog.For(tx.RouteUsed);
        var ageHours = (now - tx.CreatedAt).TotalHours;
        if (ageHours <= 24)
        {
            return 1.0;
        }

        var windowHours = (profile.ReversalWindow ?? TimeSpan.FromDays(120)).TotalHours;
        return Scoring.Clamp(1.0 - (ageHours - 24) / windowHours * 0.65, 0.35, 1.0);
    }

    private static string TimingDetail(Transaction tx, DateTimeOffset now)
    {
        var ageHours = (now - tx.CreatedAt).TotalHours;
        return tx.CompletedAt is null
            ? $"Filed {ageHours:0}h after creation; not yet settled."
            : $"Filed {ageHours:0}h after creation, {(now - tx.CompletedAt.Value).TotalHours:0}h post-settlement.";
    }

    /// <summary>
    /// Tenure, track record and KYC raise the score; a high <em>reversal rate</em>
    /// (disputes as a share of all activity) signals abuse and lowers it. Using a
    /// ratio rather than a raw count avoids penalizing heavy-but-clean users.
    /// </summary>
    private static double CustomerScore(CustomerRiskProfile c)
    {
        var tenure = Scoring.Clamp(c.AccountAgeDays / 365.0, 0, 1);
        var history = Scoring.Clamp(c.PriorSuccessfulTransactions / 50.0, 0, 1);
        var kyc = c.KycVerified ? 1.0 : 0.4;

        var totalActivity = c.PriorSuccessfulTransactions + c.PriorReversals;
        var reversalRate = totalActivity == 0 ? 0.0 : (double)c.PriorReversals / totalActivity;
        var abusePenalty = Scoring.Clamp(0.5 * reversalRate + 0.04 * c.PriorReversals, 0, 0.6);

        var baseScore = 0.35 * tenure + 0.30 * history + 0.35 * kyc;
        return Scoring.Clamp(baseScore - abusePenalty, 0, 1);
    }

    private static string CustomerDetail(CustomerRiskProfile c)
        => $"{c.AccountAgeDays}d old, {c.PriorSuccessfulTransactions} clean tx, " +
           $"{c.PriorReversals} prior reversals, KYC {(c.KycVerified ? "yes" : "no")}.";

    /// <summary>
    /// Higher upstream risk = stronger reversal case for the customer (likely
    /// fraud), but a mid-band "suspicious" zone is penalized because it often
    /// signals friendly-fraud/abuse rather than a clean third-party fraud.
    /// </summary>
    private static double FraudScore(Transaction tx)
    {
        var risk = tx.RiskScore;
        return risk switch
        {
            >= 80 => 0.9,  // strong third-party fraud signal → easy reversal
            >= 50 => 0.45, // ambiguous: could be friendly fraud
            >= 20 => 0.65,
            _ => 0.75      // clean transaction, low dispute friction
        };
    }

    /// <summary>
    /// Tiny amounts are frequently auto-refunded (high); very large amounts
    /// attract manual scrutiny (lower). Banded on the major-unit value.
    /// </summary>
    private static double AmountScore(Money amount) => amount.Amount switch
    {
        <= 25m => 0.95,
        <= 500m => 0.80,
        <= 2_500m => 0.65,
        <= 10_000m => 0.50,
        _ => 0.38
    };

    private static double CounterpartyScore(Transaction tx, ReversalContext ctx)
    {
        var score = tx.CounterpartyType switch
        {
            CounterpartyType.Merchant => 0.85,    // established dispute process
            CounterpartyType.Individual => 0.50,
            CounterpartyType.FirstParty => 0.45,  // first interaction → ambiguity
            _ => 0.55
        };

        if (ctx.CounterpartyHasDisputeHistory)
        {
            score += 0.08; // a pattern of disputes corroborates the claim
        }

        if (tx.IsCrossCurrency)
        {
            score *= 0.8; // FX recall friction
        }

        return Scoring.Clamp(score, 0, 1);
    }

    private static string CounterpartyDetail(Transaction tx, ReversalContext ctx)
    {
        var note = tx.IsCrossCurrency
            ? $"Cross-currency ({tx.FromCurrency}→{tx.ToCurrency}) complicates recall"
            : $"Counterparty type: {tx.CounterpartyType}";
        if (ctx.CounterpartyHasDisputeHistory)
        {
            note += "; prior dispute history on this counterparty";
        }

        return note + ".";
    }

    // === Decision ============================================================

    /// <summary>Exposure (major units) above which marginal odds warrant a human.</summary>
    private const decimal HighValueThreshold = 25_000m;

    /// <summary>
    /// Choose the recommended action and amount:
    /// <list type="bullet">
    /// <item>Low odds AND small exposure → <see cref="RecommendedAction.NoReversal"/>.</item>
    /// <item>High-risk + mid odds, OR very large exposure with sub-strong odds →
    /// <see cref="RecommendedAction.ManualReview"/>.</item>
    /// <item>A contested sub-amount (explicit disputed delta, or requested &lt; full)
    /// on a partial-capable reason → <see cref="RecommendedAction.PartialReversal"/>.</item>
    /// <item>Otherwise → <see cref="RecommendedAction.FullReversal"/>.</item>
    /// </list>
    /// The partial amount is sized to the contested portion when known, never
    /// exceeding what was requested or the original amount.
    /// </summary>
    private static (RecommendedAction Action, Money Amount) DecideAction(
        Transaction tx,
        Money requested,
        ReasonCodeProfile reason,
        int probability,
        ReversalContext ctx)
    {
        var currency = tx.FromCurrency;

        // Not worth pursuing: low odds and small exposure.
        if (probability < 20 && tx.Amount.Amount < 50m)
        {
            return (RecommendedAction.NoReversal, Money.Zero(currency));
        }

        // High-risk, mid-confidence cases go to a human.
        if (tx.RiskScore >= 50 && probability is >= 25 and < 70)
        {
            return (RecommendedAction.ManualReview, requested);
        }

        // Large exposure that isn't a near-certainty also gets a human in the loop.
        if (tx.Amount.Amount >= HighValueThreshold && probability < 85)
        {
            return (RecommendedAction.ManualReview, requested);
        }

        // Size the contested portion: an explicit disputed delta wins, else the
        // requested amount, each clamped to (0, full].
        var target = requested;
        if (ctx.DisputedAmount is { } disputed && disputed > 0m && disputed < tx.Amount.Amount)
        {
            var capped = Math.Min(disputed, requested.Amount);
            target = new Money(capped, currency);
        }

        var isPartial = reason.SupportsPartial && target < tx.Amount;
        return isPartial
            ? (RecommendedAction.PartialReversal, target)
            : (RecommendedAction.FullReversal, tx.Amount);
    }

    // === Confidence / priority ==============================================

    private static double ScoreConfidence(
        Transaction tx,
        IReadOnlySet<EvidenceType> available,
        ReasonCodeProfile reason)
    {
        var relevant = reason.RequiredEvidence.Concat(reason.StrengtheningEvidence).Distinct().ToList();
        var coverage = relevant.Count == 0
            ? 0.7
            : (double)relevant.Count(available.Contains) / relevant.Count;

        var confidence = 0.5 + 0.4 * coverage;
        if (tx.IsCrossCurrency)
        {
            confidence -= 0.1;
        }

        if (tx.CompletedAt is null)
        {
            confidence -= 0.05;
        }

        return Scoring.Clamp(confidence, 0, 1);
    }

    private static ConfidenceLevel BucketConfidence(double score) => score switch
    {
        >= 0.85 => ConfidenceLevel.VeryHigh,
        >= 0.7 => ConfidenceLevel.High,
        >= 0.5 => ConfidenceLevel.Medium,
        _ => ConfidenceLevel.Low
    };

    private static int Priority(int probability, Money amount)
    {
        var prob = probability / 100.0;
        var exposure = Scoring.Clamp((double)amount.Amount / 1000.0, 0, 1);
        return (int)Math.Round((prob * 0.7 + exposure * 0.3) * 100);
    }

    // === Ineligible result ===================================================

    private ReversalAnalysis BuildIneligible(Transaction tx, string reason)
    {
        return new ReversalAnalysis
        {
            TransactionId = tx.Id,
            IsEligible = false,
            SuccessProbability = 0,
            Confidence = ConfidenceLevel.VeryHigh,
            ConfidenceScore = 0.95,
            RecommendedAction = RecommendedAction.NoReversal,
            RecommendedAmount = Money.Zero(tx.FromCurrency),
            EstimatedRecovery = Money.Zero(tx.FromCurrency),
            BestReasonCode = null,
            BestReasonLabel = null,
            RankedReasonCodes = Array.Empty<RankedReasonCode>(),
            RequiredEvidence = Array.Empty<EvidenceType>(),
            SuggestedEvidence = Array.Empty<EvidenceType>(),
            Factors = Array.Empty<ScoreFactor>(),
            PriorityScore = 0,
            AIExplanation =
                $"Reversal is not recommended for transaction {tx.Id}: {reason}. " +
                "No additional evidence will change this outcome."
        };
    }

    // === Natural-language explanation ========================================

    /// <summary>
    /// Compose the detailed AI explanation as a concise analyst note:
    /// verdict → probability → reason code → rail/timing → evidence → factors.
    /// </summary>
    private static string Explain(
        Transaction tx,
        ReversalAnalysis a,
        RankedReasonCode best,
        DateTimeOffset now)
    {
        var profile = ProviderCatalog.For(tx.RouteUsed);
        var sb = new StringBuilder();

        var verdict = a.RecommendedAction switch
        {
            RecommendedAction.NoReversal => "Hold off on filing a reversal",
            RecommendedAction.ManualReview =>
                $"Route to manual review before filing (recommended amount {a.RecommendedAmount})",
            RecommendedAction.PartialReversal => $"Pursue a PARTIAL reversal of {a.RecommendedAmount}",
            _ => $"Pursue a FULL reversal of {a.RecommendedAmount}"
        };

        sb.Append(verdict)
          .Append(". Estimated success probability ")
          .Append(a.SuccessProbability)
          .Append("% (confidence ")
          .Append(a.Confidence)
          .Append(", ")
          .Append((a.ConfidenceScore * 100).ToString("0"))
          .Append("%). Expected recovery ≈ ")
          .Append(a.EstimatedRecovery)
          .Append('.')
          .AppendLine();

        if (a.BestReasonCode is not null)
        {
            sb.Append("Recommended reason code: \"")
              .Append(best.Label)
              .Append("\" — ")
              .Append(ReasonCodeCatalog.For(best.Code).Rationale)
              .AppendLine();
        }

        sb.Append("Rail: ")
          .Append(profile.DisplayName)
          .Append(", recovered via ")
          .Append(profile.Reversibility)
          .Append("; ")
          .Append(TimingDetail(tx, now))
          .AppendLine();

        if (a.BestReasonCode is { } code)
        {
            sb.Append("Scheme rules: ")
              .Append(NetworkReversalRules.Describe(profile.Reversibility, code))
              .AppendLine();
        }

        if (tx.Status is TransactionStatus.Pending or TransactionStatus.Processing)
        {
            sb.AppendLine(
                "This transaction has not settled yet — a pre-settlement cancellation is " +
                "usually faster and cheaper than a post-settlement reversal.");
        }

        if (a.RequiredEvidence.Count > 0)
        {
            sb.Append("Required evidence still missing: ")
              .Append(string.Join(", ", a.RequiredEvidence))
              .Append(". Supplying it is the single biggest lever on the odds.")
              .AppendLine();
        }
        else if (a.IsEligible)
        {
            sb.AppendLine("All required evidence for the chosen reason code is present.");
        }

        if (a.SuggestedEvidence.Count > 0)
        {
            sb.Append("Optional strengthening evidence: ")
              .Append(string.Join(", ", a.SuggestedEvidence))
              .Append('.')
              .AppendLine();
        }

        if (a.Factors.Count > 0)
        {
            sb.Append("Factor breakdown: ")
              .Append(string.Join(" · ", a.Factors.Select(f => $"{f.Name} {(f.Score * 100):0}%")))
              .Append('.');
        }

        return sb.ToString().TrimEnd();
    }
}
