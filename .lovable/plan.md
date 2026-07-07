# Smart Pay Engine — MVP Plan

A sandbox multi-currency payments prototype. No real money moves; "Sandbox" badge is visible globally. Built on React + Tailwind + Lovable Cloud (Supabase).

## 1. Design System

- Dark navy base (`#0B1220`-ish) with light-mode toggle (persisted).
- Accent gradient: `#1E40AF → #22D3EE` used on primary CTAs, balance cards, brand mark.
- Manrope (headings) + Inter (body), loaded via `<link>` in root.
- Semantic tokens in `src/styles.css` (`@theme`): background, surface, surface-elevated, foreground, muted, primary, primary-glow, accent, success, warning, danger, plus `--gradient-brand` and `--shadow-elevated`.
- Rounded-2xl cards, generous spacing, mobile-first responsive shell with bottom tab bar on mobile / side nav on desktop.
- Persistent "SANDBOX" pill in the top bar.

## 2. Backend (Lovable Cloud)

Enable Cloud, then create the schema via migration.

### Tables (all in `public`, RLS on, grants to `authenticated`)

- `profiles` — `id (uuid pk → auth.users)`, `display_name`, `pin_hash` (text, bcrypt-style hash via pgcrypto), `created_at`. Auto-created via `handle_new_user` trigger on `auth.users`.
- `accounts` — `id`, `user_id`, `currency` (enum USD/EUR/GBP), `type` (enum: checking/savings/fx), `created_at`. Unique `(user_id, currency, type)`.
- `transactions` — `id`, `user_id`, `idempotency_key` text UNIQUE, `type` (deposit/withdrawal/transfer/fx), `state` (initiated/confirmed/completed/failed), `metadata` jsonb, `created_at`.
- `ledger_entries` — `id`, `transaction_id`, `account_id`, `direction` (debit/credit), `amount_minor` bigint, `currency`, `created_at`. Append-only (no UPDATE/DELETE policy).
- `payees` — `id`, `user_id`, `name`, `account_ref`, `currency`, `created_at`.

### Views / RPCs

- `account_balances` view: `account_id`, `user_id`, `currency`, `balance_minor` = SUM(credits) − SUM(debits). RLS via underlying tables.
- RPC `post_transaction(p_idempotency_key, p_type, p_metadata, p_entries jsonb[])` — SECURITY DEFINER:
  1. Insert into `transactions` (returns existing row if idempotency key matches → no-op).
  2. Validate sum(debits) == sum(credits) per currency; if not, RAISE.
  3. Insert all `ledger_entries`.
  4. Update transaction state to `completed`.
- RPC `verify_pin(p_pin text)` returns boolean — compares against `profiles.pin_hash`.
- RPC `set_pin(p_pin text)` — sets hash for current user.
- RPC `get_fx_quote(from_ccy, to_ccy, amount_minor)` — uses a hardcoded mid-rate table + 0.5% spread; returns `{ rate, fee_minor, to_amount_minor, quote_id, expires_at }`. (Quote stored client-side in metadata; no DB table needed for MVP.)

### Seed (per new user, run in `handle_new_user`)

- Create 3 accounts (USD/EUR/GBP, type=checking).
- Insert a `deposit` transaction with balanced ledger entries giving each account a starting balance (e.g. 2,500.00 USD / 1,800.00 EUR / 1,200.00 GBP) against a system "sandbox_funding" virtual account (tracked via metadata so the double-entry rule is honored — every credit to a user account is paired with a debit to a per-user `sandbox_funding` account auto-created at signup).
- Insert 3–4 sample payees (Maria López/EUR, James Carter/GBP, Acme Inc/USD).
- Insert a handful of past completed transactions for the activity feed.

## 3. Frontend Routes

TanStack-style file routes (React Router in this template — using react-router-dom existing setup if present, else the project's router). Routes:

- `/auth` — sign in / sign up (email+password). After first signup, prompt to set a 4-digit PIN.
- `/` (protected) — Dashboard: 3 balance cards (gradient for primary currency), quick actions (Send, Add, Convert), recent 5 transactions.
- `/send` — payee picker → amount + currency → fee preview → confirmation card → PIN modal → success.
- `/add-funds` — choose currency + amount → sandbox deposit (balanced entries from sandbox_funding → user account).
- `/convert` — from/to currency + amount → live quote (rate, spread, fee) → confirm → 4-entry ledger txn (debit source, credit FX-suspense source-ccy; debit FX-suspense target-ccy, credit target).
- `/transactions` — list with filters (type, state, currency, date), colored state badges.
- `/hive` — chat UI. User types instruction → client-side parser (regex + currency symbol detection) extracts `{intent, payee, amount, currency}` → renders Confirmation Card → Confirm → PIN → execute via same send/convert path. Never auto-executes.
- `/settings` — change PIN, toggle theme, sign out.

## 4. Key Components

- `SandboxBadge`, `BalanceCard`, `TransactionRow`, `StateBadge`, `PinPad` (4-digit, masked), `ConfirmationCard`, `PayeePicker`, `CurrencyAmountInput` (handles minor units), `FxQuoteCard`, `HiveChat` + `HiveIntentCard`.

## 5. Hive Parser (MVP, client-side)

Pattern-match common phrasings:

- `send <amount> <currency> to <payee>` / `send <currency-symbol><amount> to <payee>`
- `convert <amount> <ccy> to <ccy>`
- `add <amount> <ccy>`

Map currency symbols (`$€£`) → codes. Fuzzy-match payee by name (case-insensitive, startsWith/contains). If ambiguous or unparseable, Hive responds asking for clarification — never guesses silently.

## 6. Money & Safety Rules (enforced in code + DB)

- All amounts stored as integer minor units; UI converts via `Intl.NumberFormat`.
- Every write goes through `post_transaction` RPC → balanced check is server-side.
- `idempotency_key` generated as `crypto.randomUUID()` at the moment the user lands on the confirmation screen; reused if they tap Confirm twice.
- Outbound flows (send, convert, hive-executed actions) all require PIN modal before RPC call.
- RLS: users only see their own accounts/transactions/ledger/payees.

## 7. Build Order

1. Enable Lovable Cloud.
2. Migration: enums, tables, grants, RLS policies, balances view, `handle_new_user` trigger, `post_transaction` / `verify_pin` / `set_pin` / `get_fx_quote` RPCs, seed logic.
3. Auth pages + PIN setup flow.
4. Design system tokens + app shell (nav, sandbox badge, theme toggle).
5. Dashboard with live balances + recent txns.
6. Send money flow + PIN modal + ConfirmationCard (reused).
7. Add funds + Convert flows.
8. Transactions list with filters.
9. Hive chat + parser, reusing ConfirmationCard + PIN modal.
10. Settings, polish, empty/loading/error states.

## 8. Out of scope (MVP)

- Real FX rates / live quotes — hardcoded table is fine.
- Real payment rails, KYC, webhooks.
- Multi-device PIN/2FA — single PIN per profile.
- Admin tooling.

Ready to switch to build mode and implement?
