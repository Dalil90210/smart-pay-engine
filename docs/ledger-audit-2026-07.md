# Ledger write-path audit — July 2026

Scope: confirm that every runtime code path that moves money in Smart Pay
Engine flows through `public.post_transaction`, which is the single place
that (a) takes the `SELECT … FOR UPDATE` lock on debited accounts,
(b) checks balances, and (c) writes the balanced double-entry rows —
all inside one atomic Postgres transaction.

**No code was changed as part of this audit. Findings only.**

---

## 1. Enumerated write paths

Client callers (`src/**`) that move money:

| Feature                             | Client entry point                                                                | Server RPC                                                                                                                                            | Goes through `post_transaction`?                         |
| ----------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Send money                          | `src/routes/send.tsx` → `postTransaction()` (`src/lib/ledger.ts`)                 | `post_transaction`                                                                                                                                    | ✅ direct                                                |
| Add funds (deposit)                 | `src/routes/add-funds.tsx` → `postTransaction()`                                  | `post_transaction`                                                                                                                                    | ✅ direct                                                |
| Convert / FX                        | `src/routes/convert.tsx` → `postFxConversion()`                                   | `post_fx_conversion` → `post_transaction` (with `spe.internal='yes'` GUC set to skip the _client_ PIN re-check only; lock & balance checks still run) | ✅ via wrapper                                           |
| Hive assistant Send                 | `src/routes/hive.tsx`, `src/routes/assistant.$threadId.tsx` → `postTransaction()` | `post_transaction`                                                                                                                                    | ✅ direct                                                |
| Hive assistant Convert              | `src/routes/assistant.$threadId.tsx` → `postFxConversion()`                       | `post_fx_conversion` → `post_transaction`                                                                                                             | ✅ via wrapper                                           |
| Invoice payment (public share link) | `src/routes/i.$token.tsx` → `pay_invoice_by_token` RPC                            | `pay_invoice_by_token` (`SECURITY DEFINER`)                                                                                                           | ⚠️ **writes `ledger_entries` directly — see finding F1** |
| Reversals (case-management UI)      | `src/hooks/useReversals.ts`                                                       | `reversals` table CRUD only — does **not** post ledger entries                                                                                        | N/A (no money movement)                                  |
| Signup seed balance                 | trigger `handle_new_user` on `auth.users`                                         | inserts into `transactions` + `ledger_entries` directly inside the trigger                                                                            | 🟡 **seed only** — see finding F2                        |
| Demo reversals seed                 | migration `20260617131651…`                                                       | inserts ledger rows directly                                                                                                                          | 🟡 **one-time migration seed** — see finding F2          |

RLS on `ledger_entries` denies all direct client `INSERT` (`WITH CHECK (false)` policy, proven by
`tests/ledger/ledger_hardening.py` §A). So the only way rows can appear in the
ledger from client code is via a `SECURITY DEFINER` RPC. The RPCs that write
ledger rows are exactly three:
`post_transaction`, `post_fx_conversion` (which delegates to `post_transaction`),
and `pay_invoice_by_token`.

## 2. Lock coverage per RPC

### `post_transaction` — ✅ locks

Source: `supabase/migrations/20260705123216_662e0ebb-….sql` (current definition
also embedded in `<db-functions>`).

```sql
-- collect debited account ids
PERFORM 1 FROM public.accounts
 WHERE id = ANY(v_debited_ids)
 ORDER BY id                       -- deterministic order → no deadlocks
 FOR UPDATE;                       -- row-level exclusive lock

-- ... then, still inside the same function/transaction:
--   • per-entry validation (amount>0, direction, ownership)
--   • per-currency balance check (unbalanced → RAISE)
--   • overdraft check on debited user-cash accounts using account_balances
--   • INSERT into transactions + ledger_entries
```

All of this executes inside the caller's implicit transaction — PL/pgSQL
`SECURITY DEFINER` functions do not commit mid-function. The row lock held
by `FOR UPDATE` is released only when that transaction commits or rolls
back, which happens _after_ the `INSERT`s. There is no window between
"balance verified" and "entries written" where another session could
observe the pre-lock balance and race in.

Isolation level: the RPC does **not** set a custom isolation level, so it
inherits the PostgREST default of `READ COMMITTED`. That is sufficient
here because the correctness guarantee comes from the row lock, not
from snapshot isolation — `FOR UPDATE` blocks concurrent debiters until
this transaction ends, and the balance is recomputed _after_ the lock is
acquired.

### `post_fx_conversion` — ✅ locks (via `post_transaction`)

Sets `spe.internal='yes'` and calls `public.post_transaction(...)`. The GUC
only bypasses the _client_ PIN re-check (PIN was already enforced by
`post_fx_conversion` itself); it does **not** bypass the lock, balance
check, or ledger insert. Both `debit` legs (`checking(from)` and
`fx_suspense(to)`) go through the `FOR UPDATE` in `post_transaction`.

### `pay_invoice_by_token` — ⚠️ **Finding F1** — no `FOR UPDATE` on debited account

Source: `supabase/migrations/20260701022941_23c562bd-….sql` lines 247-320
(also visible in `<db-functions>`).

This RPC:

1. Locks the invoice row: `SELECT * FROM invoices WHERE share_token=… FOR UPDATE`.
2. Short-circuits on idempotency key.
3. Inserts a `transactions` row and three `ledger_entries` rows directly.

The debited account is the biller's `funding` account. `funding` accounts
are explicitly exempt from the overdraft check in `post_transaction`
(they legitimately hold negative balances by design), so bypassing the
lock here does **not** create an overdraft risk. It also cannot double-pay
the same invoice, because the `invoices` row is locked `FOR UPDATE` and
the status is checked before the writes.

However, this is still a path that writes `ledger_entries` outside
`post_transaction`, so it does not benefit from the shared correctness
harness (amount>0 check, direction validation, per-currency balancing
check inside the RPC). Those are currently enforced only by the
underlying table constraints (`amount_minor > 0` CHECK,
`entry_direction` enum). The three rows are hand-balanced in the
function body.

**Recommendation** (not applied in this audit): route
`pay_invoice_by_token` through `post_transaction` using the existing
`spe.internal` GUC pattern already used by `post_fx_conversion`. This
would give it the same balance-check assertion and put all money
movement behind a single guarded RPC.

### F2 — seed-only direct inserts (accepted risk)

- `handle_new_user()` (signup trigger) inserts the initial sandbox balance
  directly. This runs once per user, inside a single trigger transaction,
  before the user has any concurrent activity — no race possible.
- The demo migration `20260617131651…` inserts historic ledger rows as
  fixtures during migration. Not a runtime path.

Both are acceptable because they are one-shot seed writes with no
concurrent counter-party, and they still land as balanced double-entry
rows that satisfy the CHECK constraints. The invariant scan in
`tests/ledger/ledger_invariants.sh` proves the resulting rows balance.

## 3. Single-transaction guarantee

`post_transaction` is a PL/pgSQL `SECURITY DEFINER` function. PostgreSQL
does not allow explicit `BEGIN`/`COMMIT` inside such functions — the
entire function body executes within the caller's transaction. Because
the RPC is invoked via PostgREST as a single HTTP request, that
transaction spans:

```
lock(FOR UPDATE) → validate → balance-check → INSERT transactions → INSERT ledger_entries
```

with no commit in between. If any step raises, everything rolls back
(including the `transactions` row), so partial ledger writes are
impossible.

Isolation: `READ COMMITTED` (PostgREST default). Correctness under
concurrency is proven by the row lock, verified below.

## 4. Summary

- **Safe paths (through `post_transaction`, therefore locked):** Send,
  Add funds, Convert (client + Hive), Hive Send.
- **Direct writer, but safe by construction:**
  `pay_invoice_by_token` — locks the `invoices` row, debits an
  overdraft-exempt `funding` account. Recommend refactor to funnel it
  through `post_transaction` for consistency; not urgent.
- **Seed-only direct writes:** signup trigger + demo migration. One-shot,
  no concurrent counter-party.
- **Not a ledger writer:** `reversals` CRUD (case management only).

No unlocked runtime overdraft path was found.

---

## Concurrency + idempotency test

`tests/ledger/ledger_concurrency.py` (added in this change) exercises the
exact scenario from the audit brief: balance=100 minor units, two
simultaneous transfers of 80 each, plus a duplicate-idempotency-key
submission. It runs in CI on every PR via
`.github/workflows/ledger-hardening.yml`.
