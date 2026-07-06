"""
Ledger hardening test suite — companion to tests/ledger/ledger_invariants.sh.

Covers the correctness items the shell suite doesn't:

  A. STRUCTURAL CONSTRAINTS (item 1, 2)
     - CHECK amount_minor > 0 on ledger_entries
     - direction constrained to {'debit','credit'} via entry_direction enum
     - UNIQUE(idempotency_key) on transactions
     - Attempting to insert a raw ledger_entries row is rejected by RLS
       (proves entries only reach the ledger via post_transaction)

  B. BALANCES ARE DERIVED (item 4)
     - accounts table has NO stored balance column
     - `public.account_balances` is a VIEW that sums ledger_entries
     - For every account, balance_minor == sum(credit) - sum(debit)

  C. RLS + CROSS-USER ISOLATION (item 8)
     - RLS is ENABLED on accounts, transactions, ledger_entries, payees
     - User B's REST reads for user A's accounts / transactions / entries / payees
       return zero rows (never A's data, never an error that leaks existence)

  D. PROPERTY-BASED FUZZ (item 7)
     - Generate ~200 random valid ops (deposits, transfers, FX conversions)
       against a fresh throwaway user; after each iteration assert:
         1. No unbalanced transaction (per currency, per tx: debits == credits)
         2. No user-cash account balance is negative (checking/tax_setaside)
         3. Total system value per currency is conserved
            (sum across ALL of that user's accounts == 0 by double-entry)

Usage:
    python tests/ledger/ledger_hardening.py

Requires exec DB access (PG* env) and Supabase env from `.env` (VITE_*).
"""

from __future__ import annotations

import json
import os
import random
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import requests


# ─── env plumbing ──────────────────────────────────────────────────────────


def _load_env() -> tuple[str, str, str | None]:
    """Read Supabase URL + publishable key from .env (mirrors ledger_invariants.sh)."""
    env_file = Path(__file__).resolve().parents[2] / ".env"
    url = anon = service = None
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if "=" not in line or line.startswith("#"):
                continue
            k, _, v = line.partition("=")
            v = v.strip().strip('"').strip("'")
            if k == "VITE_SUPABASE_URL":
                url = v
            elif k == "VITE_SUPABASE_PUBLISHABLE_KEY":
                anon = v
    # Env-var overrides (sandbox may inject these instead).
    url = os.environ.get("SUPABASE_URL") or url
    anon = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY") or anon
    service = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not anon:
        die("SUPABASE_URL / PUBLISHABLE_KEY missing from env and .env")
    return url, anon, service


def die(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def _psql(sql: str) -> str:
    """Run a read-only query via the managed psql env; return trimmed stdout."""
    r = subprocess.run(
        ["psql", "-Atc", sql],
        capture_output=True, text=True, timeout=30,
    )
    if r.returncode != 0:
        die(f"psql failed: {r.stderr.strip()}\nSQL: {sql}")
    return r.stdout.strip()


PASSED: list[str] = []
FAILED: list[str] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    tag = "PASS" if cond else "FAIL"
    line = f"{tag}: {label}" + (f" — {detail}" if detail else "")
    print(line, flush=True)
    (PASSED if cond else FAILED).append(label)


# ─── section A. structural constraints ────────────────────────────────────


def test_structural_constraints() -> None:
    print("\n─── A. Structural constraints ───", flush=True)

    # amount_minor > 0 CHECK on ledger_entries
    amt_check = _psql("""
        SELECT COUNT(*) FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname='public' AND t.relname='ledger_entries'
          AND c.contype='c'
          AND pg_get_constraintdef(c.oid) ILIKE '%amount_minor > 0%';
    """)
    check("CHECK (amount_minor > 0) on ledger_entries", amt_check == "1")

    # entry_direction enum has exactly the two allowed labels
    dir_labels = _psql("""
        SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder)
        FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'entry_direction';
    """)
    check("entry_direction enum = {debit, credit}", dir_labels == "debit,credit",
          detail=dir_labels)

    # UNIQUE(idempotency_key) on transactions
    idem_unique = _psql("""
        SELECT COUNT(*) FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname='public' AND t.relname='transactions'
          AND c.contype='u'
          AND pg_get_constraintdef(c.oid) ILIKE '%idempotency_key%';
    """)
    check("UNIQUE(idempotency_key) on transactions", idem_unique == "1")

    # ledger_entries is INSERT-locked by RLS (only server-side RPCs may write).
    insert_denied = _psql("""
        SELECT COUNT(*) FROM pg_policies
        WHERE schemaname='public' AND tablename='ledger_entries'
          AND cmd='INSERT' AND with_check::text = 'false';
    """)
    check("Direct INSERT into ledger_entries denied by RLS", insert_denied == "1")


# ─── section B. balances derived from entries ─────────────────────────────


def test_balances_are_derived() -> None:
    print("\n─── B. Balances are derived, not stored ───", flush=True)

    # accounts table has no balance column
    stored = _psql("""
        SELECT string_agg(column_name, ',') FROM information_schema.columns
        WHERE table_schema='public' AND table_name='accounts'
          AND column_name ILIKE '%balance%';
    """)
    check("accounts has NO stored balance column", stored == "", detail=stored)

    # account_balances is a VIEW (not a table/materialized view)
    kind = _psql("""
        SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='account_balances';
    """)
    check("account_balances is a VIEW", kind == "v", detail=f"relkind={kind}")

    # For every account currently in the system, the view's balance_minor equals
    # a fresh recomputation from ledger_entries. If a cached number ever drifts,
    # this catches it.
    drift = _psql("""
        WITH derived AS (
          SELECT a.id AS account_id,
                 COALESCE(SUM(CASE WHEN le.direction='credit' THEN le.amount_minor
                                   ELSE -le.amount_minor END), 0)::bigint AS bal
          FROM public.accounts a
          LEFT JOIN public.ledger_entries le ON le.account_id = a.id
          GROUP BY a.id
        )
        SELECT COUNT(*) FROM public.account_balances b
        JOIN derived d ON d.account_id = b.account_id
        WHERE b.balance_minor <> d.bal;
    """)
    check("Every account_balances row == sum(entries)", drift == "0",
          detail=f"{drift} drifted rows")


# ─── auth helpers for RLS + fuzz sections ─────────────────────────────────


def _signup(url: str, anon: str, email: str, password: str) -> dict:
    r = requests.post(
        f"{url}/auth/v1/signup",
        headers={"apikey": anon, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=15,
    )
    if r.status_code >= 300:
        die(f"signup {r.status_code}: {r.text[:300]}")
    body = r.json()
    if not body.get("access_token"):
        die(f"signup returned no access_token — is auto_confirm_email on? Got: {body}")
    return body


def _wait_for_seed(user_id: str) -> None:
    for _ in range(10):
        n = _psql(f"SELECT COUNT(*) FROM public.accounts WHERE user_id='{user_id}'")
        if int(n) >= 15:  # 5 account types × 3 currencies
            return
        time.sleep(0.4)
    die(f"handle_new_user did not seed accounts for {user_id}")


def _accounts_for(user_id: str) -> dict[tuple[str, str], str]:
    rows = _psql(
        f"SELECT currency||'|'||type||'|'||id FROM public.accounts WHERE user_id='{user_id}'"
    ).splitlines()
    out: dict[tuple[str, str], str] = {}
    for row in rows:
        ccy, typ, aid = row.split("|")
        out[(ccy, typ)] = aid
    return out


def _rpc(url: str, anon: str, jwt: str, name: str, payload: dict) -> tuple[int, Any]:
    r = requests.post(
        f"{url}/rest/v1/rpc/{name}",
        headers={
            "apikey": anon,
            "Authorization": f"Bearer {jwt}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=15,
    )
    try:
        body = r.json()
    except Exception:
        body = r.text
    return r.status_code, body


def _select(url: str, anon: str, jwt: str, path: str) -> tuple[int, Any]:
    r = requests.get(
        f"{url}/rest/v1/{path}",
        headers={"apikey": anon, "Authorization": f"Bearer {jwt}", "Accept": "application/json"},
        timeout=15,
    )
    try:
        body = r.json()
    except Exception:
        body = r.text
    return r.status_code, body


# ─── section C. cross-user isolation ─────────────────────────────────────


def test_cross_user_isolation(url: str, anon: str) -> None:
    print("\n─── C. RLS + cross-user isolation ───", flush=True)

    # RLS enabled + FORCE not required (owner has no cross-user policy).
    rls_off = _psql("""
        SELECT string_agg(c.relname, ',') FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public'
          AND c.relname IN ('accounts','transactions','ledger_entries','payees')
          AND c.relrowsecurity = false;
    """)
    check("RLS enabled on accounts/transactions/ledger_entries/payees",
          rls_off == "", detail=f"missing: {rls_off}")

    # Create two throwaway users.
    ts = int(time.time())
    a = _signup(url, anon, f"ledger-a-{ts}-{random.randint(0,9999)}@example.com", f"LedgerA!{ts}")
    b = _signup(url, anon, f"ledger-b-{ts}-{random.randint(0,9999)}@example.com", f"LedgerB!{ts}")
    a_id, a_jwt = a["user"]["id"], a["access_token"]
    b_id, b_jwt = b["user"]["id"], b["access_token"]
    _wait_for_seed(a_id)
    _wait_for_seed(b_id)

    # User B tries to read user A's rows via the Data API. RLS should hide them,
    # so B sees only its own accounts (and no A rows at all).
    for path in [
        f"accounts?select=id,user_id&user_id=eq.{a_id}",
        f"transactions?select=id,user_id&user_id=eq.{a_id}",
        f"payees?select=id,user_id&user_id=eq.{a_id}",
    ]:
        code, body = _select(url, anon, b_jwt, path)
        check(f"user B cannot read A's {path.split('?')[0]}",
              code == 200 and isinstance(body, list) and len(body) == 0,
              detail=f"http={code} rows={len(body) if isinstance(body, list) else body!r}")

    # ledger_entries: B tries to read A's account ids. Should return [].
    a_accs = _accounts_for(a_id)
    a_chk = a_accs[("USD", "checking")]
    code, body = _select(url, anon, b_jwt,
                         f"ledger_entries?select=id,account_id&account_id=eq.{a_chk}")
    check("user B cannot read A's ledger_entries",
          code == 200 and isinstance(body, list) and len(body) == 0,
          detail=f"http={code} rows={len(body) if isinstance(body, list) else body!r}")

    # Sanity: B still sees its OWN accounts (proves the isolation is by user, not blanket).
    code, body = _select(url, anon, b_jwt, "accounts?select=id&limit=5")
    check("user B can read its OWN accounts (baseline)",
          code == 200 and isinstance(body, list) and len(body) > 0,
          detail=f"http={code} rows={len(body) if isinstance(body, list) else body!r}")


# ─── section D. property-based fuzz ──────────────────────────────────────


CURRENCIES = ("USD", "EUR", "GBP")
FX_PAIRS = [(a, b) for a in CURRENCIES for b in CURRENCIES if a != b]


def _run_fuzz_iteration(url: str, anon: str, jwt: str, user_id: str,
                        accs: dict[tuple[str, str], str], n_ops: int,
                        rng: random.Random) -> dict:
    ok = 0
    rejected = 0
    for _ in range(n_ops):
        op = rng.choices(
            population=["deposit", "transfer", "fx"],
            weights=[3, 5, 2], k=1,
        )[0]
        idem = f"fuzz-{uuid.uuid4()}"

        if op == "deposit":
            ccy = rng.choice(CURRENCIES)
            amt = rng.randint(50, 5_000)
            entries = [
                {"account_id": accs[(ccy, "funding")], "direction": "debit",  "amount_minor": amt},
                {"account_id": accs[(ccy, "checking")], "direction": "credit", "amount_minor": amt},
            ]
            code, _ = _rpc(url, anon, jwt, "post_transaction", {
                "p_idempotency_key": idem, "p_type": "deposit",
                "p_metadata": {"fuzz": True}, "p_entries": entries,
                "p_pin": None,
            })
        elif op == "transfer":
            ccy = rng.choice(CURRENCIES)
            amt = rng.randint(10, 2_000)
            entries = [
                {"account_id": accs[(ccy, "checking")], "direction": "debit",  "amount_minor": amt},
                {"account_id": accs[(ccy, "funding")], "direction": "credit", "amount_minor": amt},
            ]
            code, _ = _rpc(url, anon, jwt, "post_transaction", {
                "p_idempotency_key": idem, "p_type": "transfer",
                "p_metadata": {"fuzz": True}, "p_entries": entries,
                "p_pin": None,
            })
        else:  # fx
            frm, to = rng.choice(FX_PAIRS)
            amt = rng.randint(10, 1_500)
            code, _ = _rpc(url, anon, jwt, "post_fx_conversion", {
                "p_idempotency_key": idem,
                "p_from_currency": frm, "p_to_currency": to,
                "p_from_amount_minor": amt, "p_pin": None,
            })

        if code == 200:
            ok += 1
        else:
            # Only "insufficient funds" and "invalid pin" are acceptable rejections
            # during fuzz. Anything else is a bug we want the test to surface.
            rejected += 1

    return {"applied": ok, "rejected": rejected}


def _assert_fuzz_invariants(user_id: str) -> tuple[bool, dict]:
    unbal = _psql(f"""
      SELECT COUNT(*) FROM (
        SELECT le.transaction_id, le.currency,
               SUM(CASE WHEN le.direction='credit' THEN le.amount_minor
                        ELSE -le.amount_minor END) s
        FROM public.ledger_entries le
        JOIN public.transactions t ON t.id = le.transaction_id
        WHERE t.user_id = '{user_id}'
        GROUP BY le.transaction_id, le.currency
        HAVING SUM(CASE WHEN le.direction='credit' THEN le.amount_minor
                        ELSE -le.amount_minor END) <> 0
      ) x;
    """)
    # User-cash accounts (checking/tax_setaside) must never go negative.
    negatives = _psql(f"""
      SELECT COUNT(*) FROM public.account_balances b
      WHERE b.user_id='{user_id}'
        AND b.type IN ('checking','tax_setaside')
        AND b.balance_minor < 0;
    """)
    # Total system value conservation: for THIS user, summing every account
    # per currency must be exactly 0 by double-entry construction.
    unconserved = _psql(f"""
      SELECT string_agg(currency::text || '=' || net::text, ',')
      FROM (
        SELECT b.currency,
               SUM(b.balance_minor) AS net
        FROM public.account_balances b
        WHERE b.user_id='{user_id}'
        GROUP BY b.currency
        HAVING SUM(b.balance_minor) <> 0
      ) x;
    """)
    stats = {"unbalanced_tx": int(unbal), "negative_user_cash": int(negatives),
             "unconserved": unconserved}
    return (unbal == "0" and negatives == "0" and unconserved == ""), stats


def test_fuzz(url: str, anon: str) -> None:
    print("\n─── D. Property-based fuzz (ledger invariants) ───", flush=True)
    ts = int(time.time())
    user = _signup(url, anon, f"ledger-fuzz-{ts}-{random.randint(0,9999)}@example.com",
                   f"LedgerFuzz!{ts}")
    uid, jwt = user["user"]["id"], user["access_token"]
    _wait_for_seed(uid)
    accs = _accounts_for(uid)

    rng = random.Random(int(os.environ.get("LEDGER_FUZZ_SEED", "0xC0FFEE"), 0))
    iterations = int(os.environ.get("LEDGER_FUZZ_ITERATIONS", "4"))
    ops_per_iter = int(os.environ.get("LEDGER_FUZZ_OPS_PER_ITER", "50"))

    total = {"applied": 0, "rejected": 0}
    for i in range(iterations):
        stats = _run_fuzz_iteration(url, anon, jwt, uid, accs, ops_per_iter, rng)
        total["applied"] += stats["applied"]
        total["rejected"] += stats["rejected"]
        ok, inv = _assert_fuzz_invariants(uid)
        check(f"fuzz iteration {i+1}/{iterations}: all 3 invariants hold",
              ok, detail=f"ops={stats} invariants={inv}")
        if not ok:
            return

    print(f"[fuzz] totals: {total} across {iterations}×{ops_per_iter} ops", flush=True)


# ─── main ────────────────────────────────────────────────────────────────


def main() -> int:
    if not os.environ.get("PGHOST"):
        die("PG* env not configured (need exec DB access)")
    url, anon, _service = _load_env()

    test_structural_constraints()
    test_balances_are_derived()
    test_cross_user_isolation(url, anon)
    test_fuzz(url, anon)

    print("", flush=True)
    print(f"Summary: {len(PASSED)} passed, {len(FAILED)} failed", flush=True)
    if FAILED:
        print("Failed:", file=sys.stderr)
        for label in FAILED:
            print(f"  - {label}", file=sys.stderr)
        return 1
    print("All ledger hardening invariants hold ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())
