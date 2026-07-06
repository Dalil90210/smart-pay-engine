"""
Ledger concurrency + idempotency test (audit brief §5-8).

Scenario:
  • Set a checking account to a known balance of 100 minor units.
  • Fire two transfers of 80 each in parallel (would each succeed alone,
    together would overdraw).
  • Assert exactly ONE wins, ONE fails, balance never goes negative,
    and the ledger still balances (per-currency debits == credits).
  • Then submit the same transfer twice with the same idempotency key;
    assert exactly one movement.

Requires exec DB access (PG* env) + Supabase env (VITE_* in .env or
SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY env vars). No service-role key,
no Personal Access Token.
"""

from __future__ import annotations

import concurrent.futures as cf
import os
import random
import subprocess
import sys
import time
import uuid
from pathlib import Path

import requests


def _load_env() -> tuple[str, str]:
    env_file = Path(__file__).resolve().parents[2] / ".env"
    url = anon = None
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
    url = os.environ.get("SUPABASE_URL") or url
    anon = (
        os.environ.get("SUPABASE_PUBLISHABLE_KEY")
        or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
        or anon
    )
    if not url or not anon:
        print("FAIL: SUPABASE_URL / PUBLISHABLE_KEY missing", file=sys.stderr)
        sys.exit(1)
    return url, anon


def _psql(sql: str) -> str:
    r = subprocess.run(["psql", "-Atc", sql], capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        print(f"FAIL: psql: {r.stderr}\nSQL: {sql}", file=sys.stderr)
        sys.exit(1)
    return r.stdout.strip()


PASSED: list[str] = []
FAILED: list[str] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    tag = "PASS" if cond else "FAIL"
    print(f"{tag}: {label}" + (f" — {detail}" if detail else ""), flush=True)
    (PASSED if cond else FAILED).append(label)


def _signup(url: str, anon: str) -> tuple[str, str]:
    ts = int(time.time())
    email = f"conc-{ts}-{random.randint(0, 9999)}@example.com"
    r = requests.post(
        f"{url}/auth/v1/signup",
        headers={"apikey": anon, "Content-Type": "application/json"},
        json={"email": email, "password": f"Conc!{ts}"},
        timeout=15,
    )
    r.raise_for_status()
    b = r.json()
    if not b.get("access_token"):
        print(f"FAIL: signup needs auto_confirm_email on: {b}", file=sys.stderr)
        sys.exit(1)
    return b["user"]["id"], b["access_token"]


def _wait_for_seed(user_id: str) -> None:
    for _ in range(15):
        n = _psql(f"SELECT COUNT(*) FROM public.accounts WHERE user_id='{user_id}'")
        if int(n) >= 15:
            return
        time.sleep(0.4)
    print("FAIL: handle_new_user did not seed accounts", file=sys.stderr)
    sys.exit(1)


def _rpc(url: str, anon: str, jwt: str, name: str, payload: dict) -> tuple[int, str]:
    r = requests.post(
        f"{url}/rest/v1/rpc/{name}",
        headers={
            "apikey": anon,
            "Authorization": f"Bearer {jwt}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=20,
    )
    return r.status_code, r.text


def _set_balance_to(user_id: str, chk_id: str, funding_id: str, target: int) -> None:
    """Adjust the USD checking balance to exactly `target` by drawing down
    the seeded balance through the ledger. We do NOT touch ledger_entries
    directly (RLS blocks it anyway) — we compute the delta and post a
    balanced correction via post_transaction under the user's JWT elsewhere.
    Here we just verify the seed balance is >= target so a single transfer
    can leave exactly `target` remaining."""
    current = int(_psql(
        f"SELECT balance_minor FROM public.account_balances WHERE account_id='{chk_id}'"
    ))
    if current < target:
        print(f"FAIL: seeded balance {current} < required {target}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    url, anon = _load_env()
    print("─── Ledger concurrency + idempotency test ───\n", flush=True)

    user_id, jwt = _signup(url, anon)
    _wait_for_seed(user_id)

    # USD accounts
    chk = _psql(
        f"SELECT id FROM public.accounts WHERE user_id='{user_id}' AND currency='USD' AND type='checking'"
    )
    fnd = _psql(
        f"SELECT id FROM public.accounts WHERE user_id='{user_id}' AND currency='USD' AND type='funding'"
    )

    # Drain USD checking down to exactly 100 minor units via a single
    # ledger-posted transfer to funding. This uses the same RPC as the app,
    # so no service role or direct ledger write.
    current = int(_psql(f"SELECT balance_minor FROM public.account_balances WHERE account_id='{chk}'"))
    drain = current - 100
    if drain < 0:
        print(f"FAIL: seeded balance {current} < 100", file=sys.stderr)
        sys.exit(1)
    if drain > 0:
        code, body = _rpc(url, anon, jwt, "post_transaction", {
            "p_idempotency_key": f"drain-{uuid.uuid4()}",
            "p_type": "transfer",
            "p_metadata": {"setup": "drain-to-100"},
            "p_entries": [
                {"account_id": chk, "direction": "debit", "amount_minor": drain},
                {"account_id": fnd, "direction": "credit", "amount_minor": drain},
            ],
        })
        if code != 200:
            print(f"FAIL: drain rpc {code}: {body}", file=sys.stderr)
            sys.exit(1)

    bal = int(_psql(f"SELECT balance_minor FROM public.account_balances WHERE account_id='{chk}'"))
    check("setup: USD checking balance = 100", bal == 100, detail=f"actual={bal}")

    # ─── #5-7: two 80-unit transfers, fired in parallel ────────────────
    def fire(key: str) -> int:
        code, _ = _rpc(url, anon, jwt, "post_transaction", {
            "p_idempotency_key": key,
            "p_type": "transfer",
            "p_metadata": {"race": True},
            "p_entries": [
                {"account_id": chk, "direction": "debit", "amount_minor": 80},
                {"account_id": fnd, "direction": "credit", "amount_minor": 80},
            ],
        })
        return code

    key_a = f"race-a-{uuid.uuid4()}"
    key_b = f"race-b-{uuid.uuid4()}"
    with cf.ThreadPoolExecutor(max_workers=2) as ex:
        fut_a = ex.submit(fire, key_a)
        fut_b = ex.submit(fire, key_b)
        code_a = fut_a.result()
        code_b = fut_b.result()

    successes = sum(1 for c in (code_a, code_b) if c == 200)
    check("exactly ONE parallel transfer succeeds",
          successes == 1, detail=f"A={code_a} B={code_b}")

    bal_after = int(_psql(f"SELECT balance_minor FROM public.account_balances WHERE account_id='{chk}'"))
    check("balance never goes negative", bal_after >= 0, detail=f"balance={bal_after}")
    check("balance after race == 20", bal_after == 20, detail=f"actual={bal_after}")

    # Every transaction for this user still balances per-currency.
    unbalanced = _psql(f"""
        SELECT COUNT(*) FROM (
          SELECT le.transaction_id, le.currency,
                 SUM(CASE WHEN direction='credit' THEN amount_minor ELSE -amount_minor END) s
            FROM public.ledger_entries le
            JOIN public.transactions t ON t.id = le.transaction_id
           WHERE t.user_id = '{user_id}'
           GROUP BY le.transaction_id, le.currency
          HAVING SUM(CASE WHEN direction='credit' THEN amount_minor ELSE -amount_minor END) <> 0
        ) x
    """)
    check("ledger still balances after race (debits==credits per tx)",
          unbalanced == "0", detail=f"unbalanced_tx_count={unbalanced}")

    # ─── #8: idempotency — same key twice, money moves once ────────────
    idem_key = f"idem-{uuid.uuid4()}"
    bal_before = int(_psql(f"SELECT balance_minor FROM public.account_balances WHERE account_id='{chk}'"))
    code_1, body_1 = _rpc(url, anon, jwt, "post_transaction", {
        "p_idempotency_key": idem_key,
        "p_type": "transfer",
        "p_metadata": {"idem": True},
        "p_entries": [
            {"account_id": chk, "direction": "debit", "amount_minor": 5},
            {"account_id": fnd, "direction": "credit", "amount_minor": 5},
        ],
    })
    code_2, body_2 = _rpc(url, anon, jwt, "post_transaction", {
        "p_idempotency_key": idem_key,
        "p_type": "transfer",
        "p_metadata": {"idem": True},
        "p_entries": [
            {"account_id": chk, "direction": "debit", "amount_minor": 5},
            {"account_id": fnd, "direction": "credit", "amount_minor": 5},
        ],
    })
    check("both idempotent calls return 200",
          code_1 == 200 and code_2 == 200, detail=f"{code_1}/{code_2}")
    check("duplicate idempotency key returns the SAME tx id",
          body_1 == body_2, detail=f"{body_1} vs {body_2}")

    bal_after_idem = int(_psql(f"SELECT balance_minor FROM public.account_balances WHERE account_id='{chk}'"))
    check("money moves exactly once for duplicate idempotency key",
          bal_before - bal_after_idem == 5,
          detail=f"delta={bal_before - bal_after_idem}")

    tx_id = body_1.strip().strip('"')
    entry_count = _psql(
        f"SELECT COUNT(*) FROM public.ledger_entries WHERE transaction_id='{tx_id}'"
    )
    check("duplicate did not double-insert ledger rows",
          entry_count == "2", detail=f"rows={entry_count}")

    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed", flush=True)
    if FAILED:
        for f in FAILED:
            print(f"  ✗ {f}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
