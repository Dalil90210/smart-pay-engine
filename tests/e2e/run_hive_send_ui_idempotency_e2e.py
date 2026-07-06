"""
UI-side idempotency check for the Hive Send money flow.

Verifies that repeating the Confirm action (rapid double-click) yields
exactly ONE update to the home dashboard: the USD balance card decreases
once, and the Recent activity list gains exactly one row — not two.

Strategy:
  1. Load `/`, snapshot:
       - USD BalanceCard displayed amount (checking, minor units)
       - Number of "To <payee>" rows visible under Recent activity
  2. Run the Hive Send flow (`/hive`) with a rapid double-click on Confirm,
     enter PIN, wait for the ✓ Sent success line.
  3. Reload `/`, wait for the newest row to appear, then re-snapshot.
  4. Assert:
       - Exactly ONE new "To <payee>" row.
       - USD balance decreased by exactly ONE debit (matches the ledger's
         debit amount for the new tx — the fee + amount, e.g. 126 minor).

Usage:
    python tests/e2e/run_hive_send_ui_idempotency_e2e.py
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

SCREENSHOTS = Path("/tmp/browser/hive-send-ui-idempotency-e2e")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("HIVE_TEST_EMAIL", "hive-send-ui-idem-e2e@test.smartpay.local")
os.environ.setdefault("HIVE_TEST_PASSWORD", "hive-send-ui-idem-e2e-Passw0rd!")


def _log(step: str, detail: str = "") -> None:
    print(f"[hive-send-ui-idem-e2e] {step}" + (f" — {detail}" if detail else ""), flush=True)


# ---- REST helpers so we can cross-check the DOM against the ledger ----

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
        {"select": "id,idempotency_key,type,state,created_at",
         "type": "eq.transfer", "order": "created_at.desc", "limit": "20"},
    )


def _debit_minor_for_tx(url: str, publishable: str, access_token: str, tx_id: str) -> int:
    entries = _rest(
        url, publishable, access_token, "ledger_entries",
        {"select": "direction,amount_minor,currency", "transaction_id": f"eq.{tx_id}"},
    )
    return sum(e["amount_minor"] for e in entries
               if e["direction"] == "debit" and e["currency"] == CURRENCY)


# ---- DOM snapshotting on `/` ----

_MONEY_RE = re.compile(r"[-−]?\s*\$?\s*([0-9][0-9,]*)\.([0-9]{2})")


def _money_text_to_minor(text: str) -> int | None:
    m = _MONEY_RE.search(text)
    if not m:
        return None
    return int(m.group(1).replace(",", "")) * 100 + int(m.group(2))


async def _snapshot_home(page: Page) -> dict:
    """Read the USD checking BalanceCard and count 'To <payee>' rows in
    Recent activity. Returns dict with `balance_minor` and `row_count`."""
    await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
    # BalanceCard for USD checking has title "USD Balance" and label "Available · checking".
    usd_card = page.locator("div").filter(has_text=re.compile(r"^USD Balance$")).locator(
        "xpath=ancestor::*[contains(@class,'card-glass')][1]"
    ).filter(has_text=re.compile(r"Available · checking", re.I)).first
    await usd_card.wait_for(state="visible", timeout=15_000)
    # Give React Query a moment to hydrate.
    for _ in range(20):
        text = await usd_card.inner_text()
        if _money_text_to_minor(text) is not None:
            break
        await page.wait_for_timeout(250)
    text = await usd_card.inner_text()
    balance_minor = _money_text_to_minor(text)

    # Count "To <payee>" rows under Recent activity heading.
    payee_rows = page.get_by_text(re.compile(rf"To {re.escape(PAYEE)}", re.I))
    row_count = await payee_rows.count()
    return {"balance_minor": balance_minor, "row_count": row_count, "raw_card_text": text}


# ---- Hive Send flow with double-click ----

async def _run_send_flow(page: Page) -> dict:
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
            if await page.get_by_text(re.compile(r"Accounts not ready|couldn't find a payee|Not enough", re.I)).count() == 0:
                raise
            _log("wait-accounts", f"attempt {attempt + 1}")
            await page.wait_for_timeout(1_500)
    await confirm.first.wait_for(state="visible", timeout=5_000)
    await page.screenshot(path=str(SCREENSHOTS / "01_confirmation.png"))
    result["steps"].append("confirmation-rendered")

    await confirm.first.click()
    try:
        await confirm.first.click(force=True, timeout=500)
        result["steps"].append("double-click-attempted")
    except PWTimeout:
        result["steps"].append("double-click-swallowed-by-unmount")

    dialog = page.get_by_role("dialog", name=re.compile(r"Authorize", re.I))
    await dialog.first.wait_for(state="visible", timeout=10_000)
    dialog_count = await dialog.count()
    if dialog_count != 1:
        await page.screenshot(path=str(SCREENSHOTS / "02_extra_dialog.png"))
        result["error"] = f"expected 1 PIN dialog, got {dialog_count}"
        return result
    result["steps"].append(f"pin-dialogs={dialog_count}")

    await page.screenshot(path=str(SCREENSHOTS / "02_pin.png"))
    await _type_pin(page, PIN)
    await dialog.first.wait_for(state="hidden", timeout=15_000)

    success = page.get_by_text(re.compile(r"^✓\s+Sent\s+", re.I)).first
    await success.wait_for(state="visible", timeout=15_000)
    await page.screenshot(path=str(SCREENSHOTS / "03_posted.png"))
    result["passed"] = True
    return result


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

    before_txs = _transfer_transactions(supabase_url, publishable, access_token)

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
            before = await _snapshot_home(page)
            _log("snapshot-before", json.dumps({k: v for k, v in before.items() if k != "raw_card_text"}))
            await page.screenshot(path=str(SCREENSHOTS / "00_home_before.png"))

            flow = await _run_send_flow(page)
            if not flow.get("passed"):
                await browser.close()
                _log("result", json.dumps(flow))
                return 1

            # Reload home; React Query will refetch balances + transactions.
            after = await _snapshot_home(page)
            # Poll briefly in case the row hasn't rendered yet.
            for _ in range(20):
                if after["row_count"] > before["row_count"]:
                    break
                await page.wait_for_timeout(400)
                after = await _snapshot_home(page)
            _log("snapshot-after", json.dumps({k: v for k, v in after.items() if k != "raw_card_text"}))
            await page.screenshot(path=str(SCREENSHOTS / "04_home_after.png"))
        except Exception as exc:
            await page.screenshot(path=str(SCREENSHOTS / "99_crash.png"))
            _log("crash", repr(exc))
            await browser.close()
            return 1

        await browser.close()

    after_txs = _transfer_transactions(supabase_url, publishable, access_token)
    before_ids = {t["id"] for t in before_txs}
    new_txs = [t for t in after_txs if t["id"] not in before_ids]
    tx_delta = len(new_txs)

    report: dict = {
        "tx_delta": tx_delta,
        "row_count_before": before["row_count"],
        "row_count_after": after["row_count"],
        "row_delta": after["row_count"] - before["row_count"],
        "balance_before_minor": before["balance_minor"],
        "balance_after_minor": after["balance_minor"],
    }

    expected_debit_minor = None
    if tx_delta == 1:
        expected_debit_minor = _debit_minor_for_tx(supabase_url, publishable, access_token, new_txs[0]["id"])
        report["expected_debit_minor"] = expected_debit_minor

    balance_delta = None
    if before["balance_minor"] is not None and after["balance_minor"] is not None:
        balance_delta = before["balance_minor"] - after["balance_minor"]
        report["balance_delta_minor"] = balance_delta

    ok = (
        tx_delta == 1
        and report["row_delta"] == 1
        and expected_debit_minor is not None
        and balance_delta == expected_debit_minor
    )
    if not ok:
        report["error"] = (
            f"tx_delta={tx_delta} row_delta={report['row_delta']} "
            f"balance_delta={balance_delta} expected_debit={expected_debit_minor}"
        )
    report["ok"] = ok

    _log("result", json.dumps(report))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
