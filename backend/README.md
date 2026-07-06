# SmartPayEngine — .NET 8 Backend

An AI-native **payment intelligence** backend built with Clean Architecture. Its
flagship is the **Intelligent Reversal Engine**: given a transaction, it returns
an explainable verdict — success probability, recommended action, the strongest
reason code, the evidence still required, and a natural-language rationale — from
a transparent, weighted-factor model rather than a black box.

> This backend lives under `backend/` and is independent of the TypeScript/React
> app at the repository root.

---

## Why it's interesting

- **Explainable scoring.** Every probability point traces back to a named
  `ScoreFactor` (score, weight, human detail). Nothing is hidden.
- **Real rail economics.** Card chargebacks, ACH returns, SEPA/SWIFT recalls and
  internal book reversals each have distinct windows, costs and success rates.
- **Scheme-rule awareness.** A reason code that wins as a card chargeback may have
  no standing on a consent-based recall — encoded in a dedicated rules matrix.
- **Partial-reversal intelligence.** Sizes the reclaim to the genuinely contested
  amount when known.
- **Swappable persistence.** In-memory for the sandbox, EF Core + SQLite for
  "real" storage — chosen by configuration, with zero changes to Core or Api.

---

## Architecture

Strict Clean Architecture; dependencies point inward only.

```
SmartPayEngine.Core            Pure domain. No framework dependencies.
  Enums/         Currency, PaymentProvider, ReasonCode, EvidenceType, ...
  ValueObjects/  Money, CustomerRiskProfile, ScoreFactor
  Entities/      Transaction, ReversalRequest, PaymentRoute, User
  Catalogs/      ProviderCatalog, ReasonCodeCatalog, NetworkReversalRules
  Models/        ReversalAnalysis, RoutingOption/Recommendation/Policy
  Services/      IntelligentReversalEngine, SmartRoutingService
  Abstractions/  Interfaces (engine, routing, repositories, clock)

SmartPayEngine.Infrastructure  Persistence, DI, time.
  Persistence/   SmartPayDbContext (EF Core), EF + in-memory repositories,
                 Migrations/
  Time/          SystemClock
  DependencyInjection.cs

SmartPayEngine.Api             ASP.NET Core Web API (HTTP only).
  Controllers/   Reversals, Routing, Transactions, Catalog
  Contracts/     Request/response DTOs

tests/SmartPayEngine.Core.Tests  xUnit: engine, routing, rules, EF round-trip.
```

Domain entities are sealed, with private constructors and static factories that
validate invariants at construction. The engine is deterministic via an injected
`ISystemClock`, which makes the time-based logic unit-testable.

---

## The reversal probability model

`IntelligentReversalEngine.AnalyzeReversal(transaction, requestedAmount, context)`
gates eligibility (terminal state / blown reversal window), ranks reason codes by
evidence-adjusted win rate, then blends nine normalized `[0,1]` factors into the
final probability:

| Factor              | Weight | What it captures                                        |
|---------------------|:------:|---------------------------------------------------------|
| Rail reversibility  | 0.18   | Base unwind success for the rail (chargeback vs recall) |
| Scheme rule fit     | 0.16   | Does this reason code have standing on this rail?       |
| Reason code strength| 0.18   | Evidence-adjusted win rate of the chosen code           |
| Timing              | 0.12   | Freshness against the rail's reversal window            |
| Settlement state    | 0.06   | Pre-settlement cancellations are far easier             |
| Customer trust      | 0.10   | Tenure / KYC / track record vs. reversal-abuse rate     |
| Fraud / risk signal | 0.08   | Upstream risk, with a penalized "friendly-fraud" band   |
| Amount scrutiny     | 0.06   | Larger claims attract more scrutiny                     |
| Counterparty & FX   | 0.06   | Channel, cross-currency friction, dispute history       |

Action selection: low odds + small exposure → **NoReversal**; high-risk mid-odds
or very large exposure → **ManualReview**; a contested sub-amount on a
partial-capable reason → **PartialReversal**; otherwise → **FullReversal**.

---

## Running

Requires the .NET 8 SDK.

```bash
cd backend
dotnet build                       # 0 warnings, 0 errors
dotnet test                        # full xUnit suite
dotnet run --project src/SmartPayEngine.Api
```

Swagger UI is served at `/swagger` in Development. By default the API uses the
SQLite store configured in `appsettings.json` (`ConnectionStrings:SmartPay`) and
applies EF Core migrations on startup. Remove that connection string to fall back
to the in-memory store.

### Database / migrations

```bash
# tooling is pinned in .config/dotnet-tools.json
dotnet tool restore
dotnet dotnet-ef migrations add <Name> \
  --project src/SmartPayEngine.Infrastructure \
  --startup-project src/SmartPayEngine.Api \
  --output-dir Persistence/Migrations
```

---

## API

### Reversal engine
| Method & path                         | Purpose                                  |
|---------------------------------------|------------------------------------------|
| `POST /api/reversals/analyze`         | Analyze a transaction (read-only)        |
| `POST /api/reversals/request`         | Analyze and persist a reversal request   |
| `GET  /api/reversals/{id}`            | Fetch a persisted request                |
| `GET  /api/reversals`                 | List requests, highest priority first    |
| `POST /api/reversals/{id}/approve`    | Approve a request                        |
| `POST /api/reversals/{id}/reject`     | Reject a request                         |

### Smart routing
| Method & path                | Purpose                                            |
|------------------------------|----------------------------------------------------|
| `POST /api/routing/analyze`  | Rank rails for a corridor (balanced/cheapest/fastest) |

### Transactions
| Method & path                                  | Purpose                       |
|------------------------------------------------|-------------------------------|
| `POST /api/transactions`                       | Create/store a transaction    |
| `GET  /api/transactions/{id}`                  | Fetch a transaction           |
| `GET  /api/transactions`                       | List transactions             |
| `GET  /api/transactions/{id}/routing`          | Route a stored transaction    |
| `POST /api/transactions/{id}/reversal-analysis`| Analyze a stored transaction  |

### Reference data
| Method & path                  | Purpose                          |
|--------------------------------|----------------------------------|
| `GET /api/catalog/providers`   | Rail economics & reversibility   |
| `GET /api/catalog/reason-codes`| Reason-code win rates & evidence |

### Example — analyze a duplicate charge

```bash
curl -s -X POST http://localhost:5102/api/reversals/analyze \
  -H 'Content-Type: application/json' \
  -d '{
        "transaction": {
          "amount": 420.00, "fromCurrency": "USD", "toCurrency": "USD",
          "provider": "CardNetwork", "status": "Completed",
          "counterpartyType": "Merchant", "riskScore": 5
        },
        "requestedAmount": 420.00,
        "context": {
          "observedDuplicate": true,
          "availableEvidence": ["DuplicateChargeRecord", "BankStatement"],
          "reasonHint": "DuplicateCharge"
        }
      }'
```

Returns ~82% probability, `FullReversal`, `DuplicateCharge`, an empty
required-evidence list, and a natural-language explanation including the scheme
rule verdict for the rail.
