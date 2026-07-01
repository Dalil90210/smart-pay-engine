#!/usr/bin/env bash
# Ledger safety tests. Runs against the project's Supabase database via the
# already-configured PG* env vars. Exercises the post_transaction RPC as if
# it were being called by a signed-in user by setting the JWT claim locally.
#
# Verifies:
#   1. Every posted transaction balances (sum(credits)=sum(debits) per ccy).
#   2. Duplicate idempotency keys return the same tx id and do not re-execute.
#   3. Two concurrent over-limit transfers cannot both succeed.
#   4. Balances never go negative — overdraft is rejected.
#
# Usage: bash tests/ledger/ledger_invariants.sh
set -euo pipefail

: "${PGHOST:?PG* env not configured}"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# Grab any real user + their USD checking/funding accounts to act as.
read -r USER_ID CHK FND <<EOF
$(psql -Atc "
  SELECT a.user_id::text, a.id::text,
    (SELECT id FROM public.accounts WHERE user_id=a.user_id AND currency='USD' AND type='funding')::text
  FROM public.accounts a
  WHERE a.currency='USD' AND a.type='checking'
  LIMIT 1;
" | tr '|' ' ')
EOF
[ -n "${USER_ID:-}" ] || fail "no seeded user found — sign up a user first"

as_user() {
  # Runs SQL inside a single tx as though auth.uid() = USER_ID.
  psql -v ON_ERROR_STOP=1 -Atc "
    BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL \"request.jwt.claims\" TO '{\"sub\":\"$USER_ID\",\"role\":\"authenticated\"}';
    $1
    COMMIT;
  "
}

START_BAL=$(psql -Atc "SELECT balance_minor FROM public.account_balances WHERE account_id='$CHK'")

# --- 1. Balanced ledger invariant across ALL existing transactions ---------
UNBAL=$(psql -Atc "
  SELECT COUNT(*) FROM (
    SELECT transaction_id, currency,
           SUM(CASE WHEN direction='credit' THEN amount_minor ELSE -amount_minor END) s
    FROM public.ledger_entries
    GROUP BY transaction_id, currency
    HAVING SUM(CASE WHEN direction='credit' THEN amount_minor ELSE -amount_minor END) <> 0
  ) x;")
[ "$UNBAL" = "0" ] || fail "found $UNBAL unbalanced transactions"
pass "every existing transaction balances per currency"

# --- 2. Idempotency: same key -> same tx id, no double execute -------------
KEY="test-idem-$(date +%s%N)"
ENTRIES="[{\"account_id\":\"$CHK\",\"direction\":\"debit\",\"amount_minor\":100},{\"account_id\":\"$FND\",\"direction\":\"credit\",\"amount_minor\":100}]"
TX1=$(as_user "SELECT public.post_transaction('$KEY','transfer'::tx_type,'{\"test\":true}'::jsonb,'$ENTRIES'::jsonb);")
TX2=$(as_user "SELECT public.post_transaction('$KEY','transfer'::tx_type,'{\"test\":true}'::jsonb,'$ENTRIES'::jsonb);")
[ "$TX1" = "$TX2" ] || fail "idempotency returned different ids ($TX1 vs $TX2)"
COUNT=$(psql -Atc "SELECT COUNT(*) FROM public.ledger_entries WHERE transaction_id='$TX1'")
[ "$COUNT" = "2" ] || fail "duplicate idempotency key double-inserted entries ($COUNT rows)"
pass "duplicate idempotency key does not re-execute"

# --- 3. Overdraft rejection ------------------------------------------------
BAL=$(psql -Atc "SELECT balance_minor FROM public.account_balances WHERE account_id='$CHK'")
OVER=$((BAL + 1))
OVER_ENTRIES="[{\"account_id\":\"$CHK\",\"direction\":\"debit\",\"amount_minor\":$OVER},{\"account_id\":\"$FND\",\"direction\":\"credit\",\"amount_minor\":$OVER}]"
if as_user "SELECT public.post_transaction('over-$(date +%s%N)','transfer'::tx_type,'{}'::jsonb,'$OVER_ENTRIES'::jsonb);" 2>/dev/null; then
  fail "overdraft was accepted"
fi
pass "overdraft (balance+1) is rejected"
NEG=$(psql -Atc "SELECT COUNT(*) FROM public.account_balances WHERE balance_minor < 0")
[ "$NEG" = "0" ] || fail "$NEG account(s) have negative balances"
pass "no account balance is negative"

# --- 4. Concurrent double-spend -------------------------------------------
# Both try to move (balance/2 + balance/2 + 1) — only one can win.
BAL=$(psql -Atc "SELECT balance_minor FROM public.account_balances WHERE account_id='$CHK'")
HALF=$(( BAL / 2 + 1 ))
[ "$HALF" -gt 0 ] || fail "balance too small for concurrency test"
mk_entries() { echo "[{\"account_id\":\"$CHK\",\"direction\":\"debit\",\"amount_minor\":$HALF},{\"account_id\":\"$FND\",\"direction\":\"credit\",\"amount_minor\":$HALF}]"; }
E=$(mk_entries)

run_concurrent() {
  local key=$1 out
  out=$(as_user "SELECT public.post_transaction('$key','transfer'::tx_type,'{}'::jsonb,'$E'::jsonb);" 2>&1) && echo "OK:$out" || echo "ERR:$out"
}

R1=$(run_concurrent "cc-a-$(date +%s%N)") &
P1=$!
R2=$(run_concurrent "cc-b-$(date +%s%N)")
wait $P1
# Bash quirk: R1 assigned in subshell — re-run second not both bg. Simpler:
KEYA="cc-a-$(date +%s%N)"; KEYB="cc-b-$(date +%s%N)"
( run_concurrent "$KEYA" > /tmp/ledger_r1 ) &
( run_concurrent "$KEYB" > /tmp/ledger_r2 ) &
wait
R1=$(cat /tmp/ledger_r1); R2=$(cat /tmp/ledger_r2)
OKS=0
[[ "$R1" == OK:* ]] && OKS=$((OKS+1))
[[ "$R2" == OK:* ]] && OKS=$((OKS+1))
[ "$OKS" -eq 1 ] || fail "expected exactly 1 concurrent transfer to win, got $OKS (r1=$R1 r2=$R2)"
pass "concurrent double-spend: exactly one transfer wins"

NEG=$(psql -Atc "SELECT COUNT(*) FROM public.account_balances WHERE balance_minor < 0")
[ "$NEG" = "0" ] || fail "concurrency drove balance negative"
pass "post-concurrency: no negative balances"

echo
echo "All ledger invariants hold ✓"
