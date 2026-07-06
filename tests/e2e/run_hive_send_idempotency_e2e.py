"""
Idempotency check for the Hive Send money flow.

Verifies that rapid double-clicks on Confirm reuse the same `idempotency_key`
and result in exactly ONE posted `transfer` transaction with a balanced
2-entry ledger (debit + credit, same currency).

Strategy:
  1. Snapshot the current count of `transfer` transactions for this user.
  2. Prompt Hive with a send intent → confirmation card renders.
  3. Rapid double-click Confirm before the PIN modal opens; the client's
     `busy`/`idemStatus` guard should swallow the second click. Even if it
     slipped through, `postTransaction` short-circuits on the existing
     idempotency_key.
  4. Enter PIN → success line.
  5. Requery `transactions` — exactly 1 new transfer tx.
  6. Requery `ledger_entries` for that tx — exactly 2, debits == credits,
     same currency, and `transactions.idempotency_key` present.

Usage:
    python tests/e2e/run_hive_send_idempotency_e2e.py

Env (optional):
    HIVE_SEND_PAYEE       default "Acme Inc"    (USD payee seeded by handle_new_user)
    HIVE_SEND_AMOUNT      default "1"
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
    _type_pin,
)
from run_hive_convert_e2e import _dismiss_onboarding  # type: ignore

PAYEE = os.environ.get("HIVE_SEND_PAYEE", "Acme Inc")
AMOUNT_MAJOR = float(os.environ.get("HIVE_SEND_AMOUNT", "1"))
AMOUNT_MINOR = int(round(AMOUNT_MAJOR * 100))
CURRENCY = "USD"
# transfer fee schedule matches src/lib/money.getTransferFee (flat 25¢ + 0.5%
# for demo amounts). Verified from prior send e2e run — for $1 the total minor
# is 126 (100 + 26 fee). We derive it dynamically from the ledger instead of
# hard-coding, so this only needs the currency & total assertion.
SCREENSHOTS = Path("/tmp/browser/hive-send-idempotency-e2e")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("HIVE_TEST_EMAIL", "hive-send-idem-e2e@test.smartpay.local")
os.environ.setdefault("HIVE_TEST_PASSWORD", "hive-send-idem-e2e-Passw0rd!")


def _log(step: str, detail: str = "") -> None:
    print(f"[hive-send-idem-e2e] {step}" + (f" — {detail}" if detail else ""), flush=True)


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


def _transfer_transactions(url: str, publishable: str, access_token: str) -> list:
    return _rest(
        url, publishable, access_token, "transactions",
        {"select": "id,idempotency_key,type,state,metadata,created_at",
         "type": "eq.transfer", "order": "created_at.desc", "limit": "20"},
    )


async def _run_flow(page: Page) -> dict:
    result: dict = {"steps": [], "passed": False}

    await page.goto(f"{BASE_URL}/hive", wait_until="domcontentloaded")
    composer = page.get_by_placeholder(re.compile(r"send .* to ", re.I))
    await composer.wait_for(state="visible", timeout=15_000)
    await _dismiss_onboarding(page)
    result["steps"].append("hive-loaded")

    prompt = f"send {AMOUNT_MAJOR:g} {CURRENCY} to {PAYEE}"
    confirm = page.get_by_role("button", name=re.compile(r"^Confirm$"))
    for attempt in range(6):
        await composer.fill(prompt)
        await page.keyboard.press("Enter")
        try:
            await confirm.first.wait_for(state="visible", timeout=5_000)
            break
        except PWTimeout:
            not_ready = page.get_by_text(re.compile(r"Accounts not ready|couldn't find a payee|Not enough", re.I))
            if await not_ready.count() == 0:
                raise
            _log("wait-accounts", f"attempt {attempt + 1}")
            await page.wait_for_timeout(1_500)
    await confirm.first.wait_for(state="visible", timeout=5_000)
    await page.screenshot(path=str(SCREENSHOTS / "01_confirmation.png"))
    result["steps"].append("confirmation-rendered")

    # Rapid double-click before PIN opens — idempotency guard must swallow #2.
    await confirm.first.click()
    try:
        await confirm.first.click(force=True, timeout=500)
        result["steps"].append("double-click-attempted")
    except PWTimeout:
        result["steps"].append("double-click-swallowed-by-unmount")

    dialogs = page.get_by_role("dialog", name=re.compile(r"Authorize", re.I))
    await dialogs.first.wait_for(state="visible", timeout=10_000)
    dialog_count = await dialogs.count()
    result["steps"].append(f"pin-dialogs={dialog_count}")
    if dialog_count != 1:
        await page.screenshot(path=str(SCREENSHOTS / "02_extra_dialog.png"))
        result["error"] = f"expected 1 PIN dialog, got {dialog_count}"
        return result

    await page.screenshot(path=str(SCREENSHOTS / "02_pin.png"))
    await _type_pin(page, PIN)
    await dialogs.first.wait_for(state="hidden", timeout=15_000)

    success = page.get_by_text(re.compile(r"^✓\s+Sent\s+", re.I)).first
    await success.wait_for(state="visible", timeout=15_000)
    await page.screenshot(path=str(SCREENSHOTS / "03_posted.png"))
    result["passed"] = True
    return result


def _verify_idempotency(url: str, publishable: str, access_token: str, before: list) -> dict:
    after = _transfer_transactions(url, publishable, access_token)
    before_ids = {t["id"] for t in before}
    new_txs = [t for t in after if t["id"] not in before_ids]

    report: dict = {
        "before_count": len(before),
        "after_count": len(after),
        "new_tx_count": len(new_txs),
    }

    if len(new_txs) != 1:
        report["ok"] = False
        report["error"] = f"expected exactly 1 new transfer tx, got {len(new_txs)}"
        report["new_txs"] = new_txs
        return report

    tx = new_txs[0]
    report["transaction_id"] = tx["id"]
    report["idempotency_key"] = tx["idempotency_key"]
    report["state"] = tx["state"]

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
    single_currency = len(per_ccy) == 1 and CURRENCY in per_ccy
    covers_amount = per_ccy.get(CURRENCY, {}).get("debit", 0) >= AMOUNT_MINOR

    report["ok"] = (
        len(entries) == 2
        and balanced
        and single_currency
        and covers_amount
        and tx["state"] == "completed"
        and bool(tx["idempotency_key"])
    )
    if not report["ok"]:
        report["error"] = (
            f"entries={len(entries)} balanced={balanced} single_currency={single_currency} "
            f"covers_amount={covers_amount} state={tx['state']} idem={bool(tx['idempotency_key'])}"
        )
    return report


async def main() -> int:
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

    before = _transfer_transactions(supabase_url, publishable, access_token)
    _log("snapshot", f"transfer-tx-before={len(before)}")

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
            result = await _run_flow(page)
        except Exception as exc:
            await page.screenshot(path=str(SCREENSHOTS / "99_crash.png"))
            _log("crash", repr(exc))
            await browser.close()
            return 1

        await browser.close()

    if not result.get("passed"):
        _log("result", json.dumps(result))
        return 1

    idem = _verify_idempotency(supabase_url, publishable, access_token, before)
    result["idempotency"] = idem
    if not idem.get("ok"):
        result["passed"] = False
        result["error"] = f"idempotency check failed: {idem.get('error')}"

    _log("result", json.dumps(result))
    return 0 if result.get("passed") else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
