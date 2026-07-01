#!/usr/bin/env bash
# Ledger safety tests. Signs up a throwaway user via the Supabase Data API
# and drives the post_transaction RPC through PostgREST (same path the app uses).
#
# Verifies:
#   1. Every existing transaction balances per currency (global invariant).
#   2. Duplicate idempotency keys return the same tx id and do not re-execute.
#   3. Overdraft (balance + 1) is rejected; no balance ever goes negative.
#   4. Two concurrent transfers that would each overdraw: exactly one wins.
#
# Usage: bash tests/ledger/ledger_invariants.sh
set -euo pipefail
: "${PGHOST:?PG* env not configured}"

URL=$(grep '^VITE_SUPABASE_URL=' .env | cut -d'"' -f2)
ANON=$(grep '^VITE_SUPABASE_PUBLISHABLE_KEY=' .env | cut -d'"' -f2)
[ -n "$URL" ] && [ -n "$ANON" ] || { echo "missing supabase env"; exit 1; }

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# --- 1. Global balance invariant ------------------------------------------
UNBAL=$(psql -Atc "
  SELECT COUNT(*) FROM (
    SELECT transaction_id, currency,
           SUM(CASE WHEN direction='credit' THEN amount_minor ELSE -amount_minor END) s
    FROM public.ledger_entries
    GROUP BY transaction_id, currency
    HAVING SUM(CASE WHEN direction='credit' THEN amount_minor ELSE -amount_minor END) <> 0
  ) x;")
[ "$UNBAL" = "0" ] || fail "found $UNBAL unbalanced transactions in the ledger"
pass "every existing transaction balances per currency"

# --- Sign up a throwaway user ----------------------------------------------
EMAIL="ledger-test-$(date +%s)-$RANDOM@example.com"
PASSWORD="LedgerTest!$(date +%s)"
SIGNUP=$(curl -sS -X POST "$URL/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
JWT=$(echo "$SIGNUP" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token") or "")')
USR=$(echo "$SIGNUP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("user") or {}).get("id") or d.get("id") or "")')
[ -n "$JWT" ] && [ -n "$USR" ] || fail "signup failed (auto_confirm_email must be on): $SIGNUP"

# Wait for handle_new_user seed to complete + grab account ids
for _ in 1 2 3 4 5; do
  CHK=$(psql -Atc "SELECT id FROM public.accounts WHERE user_id='$USR' AND currency='USD' AND type='checking'")
  FND=$(psql -Atc "SELECT id FROM public.accounts WHERE user_id='$USR' AND currency='USD' AND type='funding'")
  [ -n "$CHK" ] && [ -n "$FND" ] && break
  sleep 0.4
done
[ -n "$CHK" ] && [ -n "$FND" ] || fail "test user was not seeded with accounts"

rpc() {
  local key=$1 amount=$2
  curl -sS -o /tmp/ledger_rpc_body -w '%{http_code}' -X POST "$URL/rest/v1/rpc/post_transaction" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
    -d "{\"p_idempotency_key\":\"$key\",\"p_type\":\"transfer\",\"p_metadata\":{\"test\":true},\"p_entries\":[{\"account_id\":\"$CHK\",\"direction\":\"debit\",\"amount_minor\":$amount},{\"account_id\":\"$FND\",\"direction\":\"credit\",\"amount_minor\":$amount}]}"
}

# --- 2. Idempotency --------------------------------------------------------
KEY="idem-$(date +%s%N)"
C1=$(rpc "$KEY" 100); B1=$(cat /tmp/ledger_rpc_body | tr -d '"')
C2=$(rpc "$KEY" 100); B2=$(cat /tmp/ledger_rpc_body | tr -d '"')
[ "$C1" = "200" ] && [ "$C2" = "200" ] || fail "idempotent rpc http $C1/$C2 ($B1 / $B2)"
[ "$B1" = "$B2" ] || fail "duplicate key returned different tx ids ($B1 vs $B2)"
ENTRY_COUNT=$(psql -Atc "SELECT COUNT(*) FROM public.ledger_entries WHERE transaction_id='$B1'")
[ "$ENTRY_COUNT" = "2" ] || fail "duplicate idem key double-inserted entries ($ENTRY_COUNT rows)"
pass "duplicate idempotency key does not re-execute"

# --- 3. Overdraft rejection ------------------------------------------------
BAL=$(psql -Atc "SELECT balance_minor FROM public.account_balances WHERE account_id='$CHK'")
CODE=$(rpc "over-$(date +%s%N)" $((BAL + 1)))
[ "$CODE" != "200" ] || fail "overdraft was accepted (body: $(cat /tmp/ledger_rpc_body))"
pass "overdraft (balance+1) is rejected"
NEG=$(psql -Atc "SELECT COUNT(*) FROM public.account_balances WHERE user_id='$USR' AND type='checking' AND balance_minor < 0")
[ "$NEG" = "0" ] || fail "$NEG account(s) went negative"
pass "no account balance is negative"

# --- 4. Concurrent double-spend --------------------------------------------
BAL=$(psql -Atc "SELECT balance_minor FROM public.account_balances WHERE account_id='$CHK'")
HALF=$(( BAL / 2 + 1 )) # both together would overdraw by 2
[ "$HALF" -gt 0 ] || fail "balance too small for concurrency test"

fire() {
  local key=$1
  curl -sS -o "/tmp/cc_body_$key" -w '%{http_code}' -X POST "$URL/rest/v1/rpc/post_transaction" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
    -d "{\"p_idempotency_key\":\"$key\",\"p_type\":\"transfer\",\"p_metadata\":{},\"p_entries\":[{\"account_id\":\"$CHK\",\"direction\":\"debit\",\"amount_minor\":$HALF},{\"account_id\":\"$FND\",\"direction\":\"credit\",\"amount_minor\":$HALF}]}" \
    > "/tmp/cc_code_$key"
}

KA="cca-$(date +%s%N)"; KB="ccb-$(date +%s%N)"
fire "$KA" & P1=$!
fire "$KB" & P2=$!
wait $P1 $P2
CA=$(cat /tmp/cc_code_$KA); CB=$(cat /tmp/cc_code_$KB)
OK=0
[ "$CA" = "200" ] && OK=$((OK+1))
[ "$CB" = "200" ] && OK=$((OK+1))
[ "$OK" -eq 1 ] || fail "expected exactly 1 concurrent transfer to win, got $OK (A=$CA B=$CB)"
pass "concurrent double-spend: exactly one transfer wins"

NEG=$(psql -Atc "SELECT COUNT(*) FROM public.account_balances WHERE user_id='$USR' AND type='checking' AND balance_minor < 0")
[ "$NEG" = "0" ] || fail "concurrency drove balance negative"
pass "post-concurrency: no negative balances"

# Cleanup
psql -Atc "DELETE FROM auth.users WHERE id='$USR'" >/dev/null

echo
echo "All ledger invariants hold ✓"
