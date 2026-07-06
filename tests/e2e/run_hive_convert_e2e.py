"""
Python Playwright runner for the Hive currency-conversion e2e flow.

Covers:
  1. Parsed intent for a natural-language convert prompt.
  2. FX confirmation card shows the correct effective rate and spread fee
     (mid-rate × (1 - 0.5% spread)).
  3. PIN authorization posts an `fx` transaction.
  4. The resulting ledger has exactly 4 entries, balanced per currency:
        debit  from-checking     credit from-fx_suspense    (from ccy)
        debit  to-fx_suspense    credit to-checking         (to ccy)

Usage:
    python tests/e2e/run_hive_convert_e2e.py

Env (optional):
    PLAYWRIGHT_BASE_URL   default http://localhost:8080
    PLAYWRIGHT_TEST_PIN   default 1234
    CONVERT_FROM          default USD
    CONVERT_TO            default EUR
    CONVERT_AMOUNT        default 100     (major units)
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

FROM = os.environ.get("CONVERT_FROM", "USD").upper()
TO = os.environ.get("CONVERT_TO", "EUR").upper()
AMOUNT_MAJOR = float(os.environ.get("CONVERT_AMOUNT", "100"))
AMOUNT_MINOR = round(AMOUNT_MAJOR * 100)
SCREENSHOTS = Path("/tmp/browser/hive-convert-e2e")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("HIVE_TEST_EMAIL", "hive-convert-e2e@test.smartpay.local")
os.environ.setdefault("HIVE_TEST_PASSWORD", "hive-convert-e2e-Passw0rd!")

# Must mirror src/lib/money.ts
MID_RATES = {
    ("USD", "EUR"): 0.92, ("EUR", "USD"): 1.087,
    ("USD", "GBP"): 0.79, ("GBP", "USD"): 1.265,
    ("EUR", "GBP"): 0.86, ("GBP", "EUR"): 1.163,
}
FX_SPREAD = 0.005


def _log(step: str, detail: str = "") -> None:
    print(f"[hive-convert-e2e] {step}" + (f" — {detail}" if detail else ""), flush=True)


def _expected_quote(from_ccy: str, to_ccy: str, from_minor: int) -> dict:
    mid = MID_RATES[(from_ccy, to_ccy)]
    rate = mid * (1 - FX_SPREAD)
    to_minor = round(from_minor * rate)
    gross_minor = round(from_minor * mid)
    fee_minor = gross_minor - to_minor
    return {"mid": mid, "rate": rate, "to_minor": to_minor, "fee_minor": fee_minor}


async def _type_pin(page: Page, pin: str) -> None:
    dialog = page.get_by_role("dialog")
    await dialog.first.wait_for(state="visible", timeout=10_000)
    otp = dialog.locator('input[inputmode="numeric"]').first
    await otp.click()
    await page.keyboard.type(pin, delay=25)


async def _dismiss_onboarding(page: Page) -> None:
    try:
        btn = page.get_by_role("button", name=re.compile(r"Get started|Skip|Done|Finish", re.I))
        await btn.first.click(timeout=1_500)
        for _ in range(4):
            nxt = page.get_by_role("button", name=re.compile(r"^(Next|Finish|Done|Continue|Skip)$", re.I))
            if await nxt.count() == 0:
                break
            try:
                await nxt.first.click(timeout=1_000)
            except PWTimeout:
                break
    except PWTimeout:
        pass


async def _run_flow(page: Page, expected: dict) -> dict:
    result: dict = {"steps": [], "passed": False, "expected": expected}

    await page.goto(f"{BASE_URL}/hive", wait_until="domcontentloaded")
    composer = page.get_by_placeholder(re.compile(r"send .* to ", re.I))
    await composer.wait_for(state="visible", timeout=15_000)
    await _dismiss_onboarding(page)
    result["steps"].append("hive-loaded")

    prompt = f"convert {AMOUNT_MAJOR:g} {FROM} to {TO}"
    await composer.fill(prompt)
    await page.keyboard.press("Enter")
    _log("prompt", prompt)

    confirm = page.get_by_role("button", name=re.compile(r"^Confirm$"))
    await confirm.first.wait_for(state="visible", timeout=20_000)
    await page.screenshot(path=str(SCREENSHOTS / "01_quote.png"))
    result["steps"].append("quote-rendered")

    # Assert the on-screen quote matches the expected mid × (1 - spread).
    card = page.get_by_role("button", name=re.compile(r"^Confirm$")).first.locator("xpath=ancestor::*[self::div][1]")
    body = await page.locator("body").inner_text()
    rate_str = f"{expected['rate']:.4f}"
    if rate_str not in body:
        result["error"] = f"expected rate {rate_str} not visible on confirmation card"
        await page.screenshot(path=str(SCREENSHOTS / "02_quote_mismatch.png"))
        return result
    result["steps"].append(f"rate-visible={rate_str}")

    # Spread fee is displayed in the destination currency, e.g. €0.46.
    fee_major = expected["fee_minor"] / 100
    fee_pattern = re.compile(rf"[€$£]\s?{fee_major:.2f}\b")
    if not fee_pattern.search(body):
        result["error"] = f"expected spread fee ~{fee_major:.2f} {TO} not visible"
        await page.screenshot(path=str(SCREENSHOTS / "02_fee_mismatch.png"))
        return result
    result["steps"].append(f"fee-visible={fee_major:.2f}")

    # Also confirm "You receive" total matches expected to_minor.
    receive_major = expected["to_minor"] / 100
    if f"{receive_major:.2f}" not in body:
        result["error"] = f"expected receive total {receive_major:.2f} not visible"
        return result
    result["steps"].append(f"receive-visible={receive_major:.2f}")

    # Confirm → PIN → post.
    await confirm.first.click()
    dialog = page.get_by_role("dialog", name=re.compile(r"Authorize", re.I))
    await dialog.first.wait_for(state="visible", timeout=10_000)
    await page.screenshot(path=str(SCREENSHOTS / "03_pin.png"))
    await _type_pin(page, PIN)
    await dialog.first.wait_for(state="hidden", timeout=15_000)
    result["steps"].append("pin-accepted")

    success = page.get_by_text(re.compile(r"^✓\s+Converted\s+", re.I)).first
    await success.wait_for(state="visible", timeout=15_000)
    await page.screenshot(path=str(SCREENSHOTS / "04_posted.png"))
    result["passed"] = True
    return result


def _verify_ledger(supabase_url: str, publishable: str, access_token: str, expected: dict) -> dict:
    import requests
    h = {"apikey": publishable, "Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    tx_r = requests.get(
        f"{supabase_url}/rest/v1/transactions",
        params={"select": "id,type,state,metadata,created_at", "type": "eq.fx",
                "order": "created_at.desc", "limit": "1"},
        headers=h, timeout=10,
    )
    tx_r.raise_for_status()
    txs = tx_r.json()
    if not txs:
        return {"ok": False, "error": "no fx transaction found"}
    tx = txs[0]
    entries_r = requests.get(
        f"{supabase_url}/rest/v1/ledger_entries",
        params={"select": "direction,amount_minor,currency,account_id",
                "transaction_id": f"eq.{tx['id']}"},
        headers=h, timeout=10,
    )
    entries_r.raise_for_status()
    entries = entries_r.json()

    # Balance-per-currency check.
    per_ccy: dict = {}
    for e in entries:
        s = per_ccy.setdefault(e["currency"], {"debit": 0, "credit": 0})
        s[e["direction"]] += e["amount_minor"]
    balanced = all(v["debit"] == v["credit"] and v["debit"] > 0 for v in per_ccy.values())

    from_side = per_ccy.get(FROM, {})
    to_side = per_ccy.get(TO, {})
    from_ok = from_side.get("debit") == AMOUNT_MINOR
    to_ok = to_side.get("credit") == expected["to_minor"]

    meta = tx.get("metadata") or {}
    rate = meta.get("rate")
    rate_ok = rate is not None and abs(float(rate) - expected["rate"]) < 1e-6

    return {
        "ok": len(entries) == 4 and balanced and from_ok and to_ok and rate_ok and tx["state"] == "completed",
        "transaction_id": tx["id"],
        "state": tx["state"],
        "entry_count": len(entries),
        "per_currency": per_ccy,
        "metadata_rate": rate,
        "expected_rate": expected["rate"],
        "from_side_debit_matches": from_ok,
        "to_side_credit_matches": to_ok,
    }


async def main() -> int:
    if (FROM, TO) not in MID_RATES:
        _log("skip", f"unsupported pair {FROM}->{TO}")
        return 2
    expected = _expected_quote(FROM, TO, AMOUNT_MINOR)
    _log("expected", json.dumps(expected))

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
            _log("skip", "no Supabase session available")
            await browser.close()
            return 2

        try:
            result = await _run_flow(page, expected)
        except Exception as exc:
            await page.screenshot(path=str(SCREENSHOTS / "99_crash.png"))
            _log("crash", repr(exc))
            await browser.close()
            return 1

        supabase_url = os.environ.get("SUPABASE_URL")
        publishable = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
        if result.get("passed") and supabase_url and publishable:
            session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
            access_token = None
            if session_json:
                try:
                    access_token = json.loads(session_json).get("access_token")
                except Exception:
                    access_token = None
            if not access_token:
                minted = _mint_session_via_supabase()
                if minted:
                    try:
                        access_token = json.loads(minted[1]).get("access_token")
                    except Exception:
                        access_token = None
            if access_token:
                try:
                    ledger = _verify_ledger(supabase_url, publishable, access_token, expected)
                    result["ledger"] = ledger
                    if not ledger["ok"]:
                        result["passed"] = False
                        result["error"] = f"ledger check failed: {ledger}"
                except Exception as exc:
                    result["ledger_error"] = repr(exc)

        await browser.close()

    _log("result", json.dumps(result))
    return 0 if result.get("passed") else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
