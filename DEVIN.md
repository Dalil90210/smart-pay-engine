# Working with Devin in this repository

This document explains how [Devin](https://app.devin.ai) is wired into
`Dalil90210/smart-pay-engine`, how to trigger it, and the conventions it follows
when contributing code.

SmartPayEngine is an AI-native payment intelligence layer. The flagship work
lives in the **.NET 8 Clean Architecture backend** under [`backend/`](./backend),
centered on the **Intelligent Reversal Engine**.

---

## How to trigger Devin

There are three ways to get Devin working on something:

1. **From the Devin web app** — open a session at
   [app.devin.ai](https://app.devin.ai), point it at this repo, and describe the
   task. This is the most direct route.

2. **Via a PR comment** — comment on any open Pull Request and mention
   `@Devin` (for example, `@Devin please add tests for the partial-reversal
path`). The [`devin-trigger`](./.github/workflows/devin-trigger.yml) workflow
   forwards the comment to Devin.

3. **Via an issue comment** — the same `@Devin ...` mention works on issues.
   Bot comments (including Devin's own) are ignored to avoid loops.

The workflow also fires automatically on pull request `opened`, `reopened`,
`synchronize`, and `labeled` events so Devin is aware of new/updated PRs.

> The workflow only **notifies** Devin. Devin makes changes through its own
> GitHub App identity (see [Installing Devin's GitHub App](#installing-devins-github-app)),
> never through the Actions token.

---

## Branch naming convention

Devin always works on a dedicated branch prefixed with `devin/`:

```
devin/<short-description>
devin/<timestamp>-<short-description>
```

Examples: `devin/setup-devin-integration`,
`devin/1781902582-dotnet-reversal-engine`.

Never commit directly to `main`. Open a Pull Request from the `devin/` branch.

---

## Current active work — PR #3 (Intelligent Reversal Engine)

> **Most important:** the active backend work lives on
> **[PR #3](https://github.com/Dalil90210/smart-pay-engine/pull/3)**
> (branch `devin/1781902582-dotnet-reversal-engine`).
>
> **Continue building on top of PR #3 — do not start a new solution from
> scratch.** The .NET backend already exists with domain models, EF Core/SQLite
> persistence, Smart Routing, the Intelligent Reversal Engine, and a passing
> test suite. New reversal-engine work should extend that branch.

---

## Repository architecture

The .NET backend uses Clean Architecture with strict dependency direction
(`Api` -> `Infrastructure` -> `Core`; `Core` depends on nothing):

| Project                         | Responsibility                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SmartPayEngine.Core`           | Domain models, value objects, enums, catalogs, and business logic — including the **IntelligentReversalEngine** and **SmartRoutingService**. Framework-agnostic; no EF/ASP.NET references. |
| `SmartPayEngine.Infrastructure` | Persistence (EF Core / SQLite), repositories, `SystemClock`, and the `AddSmartPayEngine()` DI wiring.                                                                                      |
| `SmartPayEngine.Api`            | ASP.NET Core Web API — controllers, request/response contracts, Swagger.                                                                                                                   |
| `SmartPayEngine.Tests`          | xUnit tests for the engine, routing, and persistence.                                                                                                                                      |

---

## Best practices for this repo

- **Keep `Core` pure.** No EF Core, ASP.NET, or other framework types in the
  domain layer. Persistence concerns belong in `Infrastructure`.
- **Domain models** — prefer records/value objects for immutable concepts
  (`Money`, `ScoreFactor`, `CustomerRiskProfile`). Validate inside the domain
  and return `Result`-style outcomes rather than throwing for expected errors.
- **IntelligentReversalEngine** — this is the flagship feature; keep it the most
  sophisticated part of the codebase. Extend the weighted-factor model and the
  scheme-rule matrix (`NetworkReversalRules`) rather than bolting on ad-hoc
  conditionals. Every factor should contribute a transparent, explainable
  `ScoreFactor` that feeds the natural-language explanation.
- **Entity Framework** — money is persisted as `"amount|currency"` and evidence
  as CSV; keep value-object conversions in the EF configuration. Add a migration
  for any schema change; never hand-edit the database.
- **Testing** — add/extend xUnit tests for any engine or routing change. Run
  `dotnet test` before opening or updating a PR. There is a reusable testing
  skill under `.agents/skills/testing-dotnet-reversal-api/`.
- **API** — serialize enums as strings, map domain errors to `400`
  `ProblemDetails`, and return `201` on resource creation.
- **Comments** — XML doc comments on public domain types and services.

### Build, test, run

```bash
cd backend
dotnet build                                   # Debug + Release should be clean
dotnet test                                    # all tests must pass
dotnet run --project src/SmartPayEngine.Api    # Swagger at the printed URL
```

---

## Installing Devin's GitHub App

For Devin to create branches, push commits, and open Pull Requests on this
repository, install Devin's **official GitHub App** and grant it the permissions
below.

1. In the Devin web app, go to **Settings -> Integrations -> GitHub** and start
   the GitHub App installation (or open the app's install page directly from
   GitHub Marketplace).
2. Choose the **`Dalil90210`** account/organization.
3. Select **Only select repositories** and pick **`smart-pay-engine`**
   (or grant access to all repositories if you prefer).
4. Grant the following **repository permissions**:

   | Permission        | Access       |
   | ----------------- | ------------ |
   | **Contents**      | Read & Write |
   | **Pull requests** | Read & Write |
   | **Checks**        | Read & Write |

5. Click **Install** (or **Save** if updating an existing installation), then
   approve the permission change.

### Configure repository secrets

The [`devin-trigger`](./.github/workflows/devin-trigger.yml) workflow needs two
secrets. Add them under **Settings -> Secrets and variables -> Actions -> New
repository secret**:

| Secret               | Value                                                                    |
| -------------------- | ------------------------------------------------------------------------ |
| `DEVIN_API_TOKEN`    | API token from Devin (**Settings -> API Keys**). Sent as a Bearer token. |
| `DEVIN_API_ENDPOINT` | Devin sessions endpoint, e.g. `https://api.devin.ai/v1/sessions`.        |

If these secrets are absent (e.g. on forks), the workflow skips the notification
step gracefully instead of failing.
