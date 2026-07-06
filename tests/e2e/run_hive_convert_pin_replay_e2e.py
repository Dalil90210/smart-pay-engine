"""
PIN-replay idempotency check for the Hive FX Convert flow.

Verifies that entering the correct PIN twice (or invoking Verify PIN + the
underlying `post_fx_conversion` RPC repeatedly) for the SAME idempotency key
produces exactly ONE `fx` transaction and ONE 4-entry balanced ledger — no
duplicate transaction, no extra ledger rows.

Strategy:
  1. Snapshot the caller's `fx` transactions.
  2. Run the full Hive convert flow through the UI: prompt → Confirm → PIN.
     The PIN modal auto-submits on the 4th digit and the server posts the
     transaction under idempotency_key K (generated client-side at intent time).
  3. Read K back from the just-created transaction.
  4. From the live browser context (authenticated Supabase session), call
     `verify_pin` twice and `post_fx_conversion` twice with the SAME K, pin,
     and amounts. The server-side idempotency short-circuit must return the
     existing transaction on the replays and MUST NOT insert new ledger rows.
  5. Re-snapshot: exactly 1 new fx tx overall, 4 ledger entries, balanced per
     currency, `verify_pin` returned true both times, and the replay RPC
     returned the same `transaction_id` as the original post.

Usage:
    python tests/e2e/run_hive_convert_pin_replay_e2e.py
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout

sys.path.insert(0, str(Path(__file__).parent))
from run_hive_e2e import (  # type: ignore
    BASE_URL,
    PIN,
    _find_chromium,
    _mint_session_via_supabase,
    _restore_session,
)
from run_hive_convert_e2e import (  # type: ignore
    AMOUNT_MAJOR,
    AMOUNT_MINOR,
    FROM,
    TO,
    MID_RATES,
    _dismiss_onboarding,
    _expected_quote,
    _type_pin,
)

SCREENSHOTS = Path("/tmp/browser/hive-convert-pin-replay-e2e")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("HIVE_TEST_EMAIL", "hive-convert-pin-replay-e2e@test.smartpay.local")
os.environ.setdefault("HIVE_TEST_PASSWORD", "hive-convert-pin-replay-e2e-Passw0rd!")


def _log(step: str, detail: str = "") -> None:
    print(f"[hive-convert-pin-replay-e2e] {step}" + (f" — {detail}" if detail else ""), flush=True)


def _rest(url: str, publishable: str, access_token: str, path: str, params: dict) -> list:
    import requests
    r = requests.get(
        f"{url}/rest/v1/{path}",
        params=params,
        headers={"apikey": publishable, "Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def _fx_transactions(url: str, publishable: str, access_token: str) -> list:
    return _rest(
        url, publishable, access_token, "transactions",
        {"select": "id,idempotency_key,type,state,created_at", "type": "eq.fx",
         "order": "created_at.desc", "limit": "20"},
    )


async def _run_ui_flow(page: Page) -> dict:
    result: dict = {"steps": [], "passed": False}

    await page.goto(f"{BASE_URL}/hive", wait_until="domcontentloaded")
    composer = page.get_by_placeholder(re.compile(r"send .* to ", re.I))
    await composer.wait_for(state="visible", timeout=15_000)
    await _dismiss_onboarding(page)
    result["steps"].append("hive-loaded")

    prompt = f"convert {AMOUNT_MAJOR:g} {FROM} to {TO}"
    confirm = page.get_by_role("button", name=re.compile(r"^Confirm$"))
    for attempt in range(6):
        await composer.fill(prompt)
        await page.keyboard.press("Enter")
        try:
            await confirm.first.wait_for(state="visible", timeout=5_000)
            break
        except PWTimeout:
            if await page.get_by_text(re.compile(r"Accounts not ready", re.I)).count() == 0:
                raise
            _log("wait-accounts", f"attempt {attempt + 1}")
            await page.wait_for_timeout(1_500)
    await confirm.first.wait_for(state="visible", timeout=5_000)
    await page.screenshot(path=str(SCREENSHOTS / "01_quote.png"))
    result["steps"].append("quote-rendered")

    await confirm.first.click()
    dialog = page.get_by_role("dialog", name=re.compile(r"Authorize", re.I))
    await dialog.first.wait_for(state="visible", timeout=10_000)
    await page.screenshot(path=str(SCREENSHOTS / "02_pin.png"))
    await _type_pin(page, PIN)
    await dialog.first.wait_for(state="hidden", timeout=15_000)
    result["steps"].append("pin-1-accepted")

    success = page.get_by_text(re.compile(r"^✓\s+Converted\s+", re.I)).first
    await success.wait_for(state="visible", timeout=15_000)
    await page.screenshot(path=str(SCREENSHOTS / "03_posted.png"))
    result["passed"] = True
    return result


async def _replay_pin_and_rpc(page: Page, idempotency_key: str) -> dict:
    """Simulate 'entering PIN twice / clicking Verify PIN repeatedly' by
    calling verify_pin twice and post_fx_conversion twice with the SAME
    idempotency key from the live authenticated browser context."""
    return await page.evaluate(
        """async ({ key, pin, from, to, fromMinor }) => {
            const mod = await import('/src/integrations/supabase/client.ts');
            const sb = mod.supabase;
            const verify = [];
            for (let i = 0; i < 2; i++) {
                const { data, error } = await sb.rpc('verify_pin', { p_pin: pin });
                verify.push({ data, error: error ? error.message : null });
            }
            const replays = [];
            for (let i = 0; i < 2; i++) {
                const { data, error } = await sb.rpc('post_fx_conversion', {
                    p_idempotency_key: key,
                    p_from_currency: from,
                    p_to_currency: to,
                    p_from_amount_minor: fromMinor,
                    p_pin: pin,
                });
                replays.push({ data, error: error ? error.message : null });
            }
            return { verify, replays };
        }""",
        {"key": idempotency_key, "pin": PIN, "from": FROM, "to": TO, "fromMinor": AMOUNT_MINOR},
    )


def _verify(url: str, publishable: str, access_token: str, before: list,
            expected: dict, replay: dict) -> dict:
    after = _fx_transactions(url, publishable, access_token)
    before_ids = {t["id"] for t in before}
    new_txs = [t for t in after if t["id"] not in before_ids]

    report: dict = {
        "before_count": len(before),
        "after_count": len(after),
        "new_tx_count": len(new_txs),
        "verify_results": [v.get("data") for v in replay.get("verify", [])],
        "verify_errors": [v.get("error") for v in replay.get("verify", [])],
        "replay_errors": [r.get("error") for r in replay.get("replays", [])],
    }

    if len(new_txs) != 1:
        report["ok"] = False
        report["error"] = f"expected exactly 1 new fx tx, got {len(new_txs)}"
        report["new_txs"] = new_txs
        return report

    tx = new_txs[0]
    report["transaction_id"] = tx["id"]
    report["idempotency_key"] = tx["idempotency_key"]

    # Both replay RPCs should have returned the same tx id.
    replay_ids = []
    for r in replay.get("replays", []):
        d = r.get("data")
        if isinstance(d, dict):
            replay_ids.append(d.get("transaction_id") or d.get("id"))
        else:
            replay_ids.append(None)
    report["replay_ids"] = replay_ids
    replays_match = all(rid == tx["id"] for rid in replay_ids if rid)

    entries = _rest(
        url, publishable, access_token, "ledger_entries",
        {"select": "direction,amount_minor,currency", "transaction_id": f"eq.{tx['id']}"},
    )
    report["entry_count"] = len(entries)

    per_ccy: dict = {}
    for e in entries:
        s = per_ccy.setdefault(e["currency"], {"debit": 0, "credit": 0})
        s[e["direction"]] += e["amount_minor"]
    report["per_currency"] = per_ccy

    balanced = all(v["debit"] == v["credit"] and v["debit"] > 0 for v in per_ccy.values())
    from_ok = per_ccy.get(FROM, {}).get("debit") == AMOUNT_MINOR
    to_ok = per_ccy.get(TO, {}).get("credit") == expected["to_minor"]
    verify_ok = all(v is True for v in report["verify_results"])
    no_replay_errors = all(e is None for e in report["replay_errors"])

    report["ok"] = (
        len(entries) == 4
        and balanced
        and from_ok
        and to_ok
        and tx["state"] == "completed"
        and bool(tx["idempotency_key"])
        and verify_ok
        and no_replay_errors
        and replays_match
    )
    if not report["ok"]:
        report["error"] = (
            f"entries={len(entries)} balanced={balanced} from_ok={from_ok} "
            f"to_ok={to_ok} state={tx['state']} verify_ok={verify_ok} "
            f"no_replay_errors={no_replay_errors} replays_match={replays_match}"
        )
    return report


async def main() -> int:
    if (FROM, TO) not in MID_RATES:
        _log("skip", f"unsupported pair {FROM}->{TO}")
        return 2
    expected = _expected_quote(FROM, TO, AMOUNT_MINOR)

    supabase_url = os.environ.get("SUPABASE_URL")
    publishable = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    if not supabase_url or not publishable:
        _log("skip", "SUPABASE_URL / PUBLISHABLE_KEY missing")
        return 2

    minted = _mint_session_via_supabase()
    if not minted:
        _log("skip", "cannot mint session")
        return 2
    access_token = json.loads(minted[1]).get("access_token")
    if not access_token:
        _log("skip", "no access_token")
        return 2

    before = _fx_transactions(supabase_url, publishable, access_token)
    _log("snapshot", f"fx-tx-before={len(before)}")

    async with async_playwright() as pw:
        launch_kwargs: dict = {"headless": True}
        exe = _find_chromium()
        if exe:
            launch_kwargs["executable_path"] = exe
        browser = await pw.chromium.launch(**launch_kwargs)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        ok = await _restore_session(context, page)
        if not ok:
            await browser.close()
            _log("skip", "no session in browser")
            return 2

        try:
            result = await _run_ui_flow(page)
        except Exception as exc:
            await page.screenshot(path=str(SCREENSHOTS / "99_crash.png"))
            _log("crash", repr(exc))
            await browser.close()
            return 1

        if not result.get("passed"):
            await browser.close()
            _log("result", json.dumps(result))
            return 1

        # Read back the just-created transaction's idempotency_key so the
        # replay uses the exact same key the client generated.
        after1 = _fx_transactions(supabase_url, publishable, access_token)
        before_ids = {t["id"] for t in before}
        new1 = [t for t in after1 if t["id"] not in before_ids]
        if len(new1) != 1 or not new1[0].get("idempotency_key"):
            await browser.close()
            result["error"] = f"expected 1 new tx with idempotency_key after UI post, got {new1}"
            _log("result", json.dumps(result))
            return 1
        idem_key = new1[0]["idempotency_key"]
        _log("idempotency-key", idem_key)

        try:
            replay = await _replay_pin_and_rpc(page, idem_key)
            result["steps"].append("pin-2-replayed")
            result["replay_raw"] = replay
        except Exception as exc:
            await page.screenshot(path=str(SCREENSHOTS / "98_replay_crash.png"))
            _log("replay-crash", repr(exc))
            await browser.close()
            return 1

        await browser.close()

    check = _verify(supabase_url, publishable, access_token, before, expected, replay)
    result["verification"] = check
    if not check.get("ok"):
        result["passed"] = False
        result["error"] = f"pin-replay idempotency failed: {check.get('error')}"

    _log("result", json.dumps(result))
    return 0 if result.get("passed") else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
