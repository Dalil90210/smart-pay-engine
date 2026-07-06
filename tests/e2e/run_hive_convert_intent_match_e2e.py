"""
Python Playwright runner: parsed intent ↔ posted FX quote parity.

Asserts that the fields the user sees on the Hive FX confirmation card —
which come directly from the parsed intent + client-side quote — match the
metadata of the `fx` transaction posted after PIN verification:

  parsed intent .amount_minor       == tx.metadata.from_amount_minor
  parsed intent .from currency      == tx.metadata.from_currency
  parsed intent .to currency        == tx.metadata.to_currency
  card "You receive" total          == tx.metadata.to_amount_minor
  card spread fee                   == tx.metadata.fee_minor
  card effective-rate string        == tx.metadata.effective_rate (4dp)

The FX RPC recomputes money server-side, so a mismatch means either the
client rendered a different quote than it submitted, or the parse produced
different amounts/currencies than the confirmation card displayed.

Usage:
    python tests/e2e/run_hive_convert_intent_match_e2e.py
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright, Page

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

SCREENSHOTS = Path("/tmp/browser/hive-convert-intent-match-e2e")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("HIVE_TEST_EMAIL", "hive-convert-intent-e2e@test.smartpay.local")
os.environ.setdefault("HIVE_TEST_PASSWORD", "hive-convert-intent-e2e-Passw0rd!")

CCY_SYMBOL = {"USD": "$", "EUR": "€", "GBP": "£"}


def _log(step: str, detail: str = "") -> None:
    print(f"[hive-convert-intent-match-e2e] {step}" + (f" — {detail}" if detail else ""), flush=True)


def _parse_money(text: str, ccy: str) -> int | None:
    """Return minor units of the first `<sym>N[.NN]` match for currency `ccy`."""
    sym = re.escape(CCY_SYMBOL[ccy])
    # Accept both "$1,234.56" and "1,234.56 USD" phrasings.
    m = re.search(rf"{sym}\s?([\d,]+\.\d{{2}})", text)
    if not m:
        m = re.search(rf"([\d,]+\.\d{{2}})\s*{ccy}\b", text)
    if not m:
        return None
    return round(float(m.group(1).replace(",", "")) * 100)


async def _capture_intent_from_card(page: Page, from_ccy: str, to_ccy: str) -> dict:
    """Read amount, currency pair, fee, and total from the visible confirmation card."""
    # The Confirm button is rendered outside ConfirmationCard, so scope to the
    # nearest ancestor that also contains the "Review" header rendered by
    # ConfirmationCard. That ancestor holds both the card rows and the button.
    confirm = page.get_by_role("button", name=re.compile(r"^Confirm$")).first
    card = confirm.locator(
        "xpath=ancestor::*[.//text()[contains(translate(., 'REVIEW', 'review'), 'review')]][1]"
    )
    text = await card.inner_text()

    # The confirmation card shows amount lines like "$100.00 USD" and "€91.54 EUR".
    from_amount = _parse_money(text, from_ccy)
    to_amount = _parse_money(text, to_ccy)

    # Fee shown in destination currency, first fee-labeled occurrence.
    fee_match = re.search(
        rf"(?:Fee|Spread)[^\n$€£]*({re.escape(CCY_SYMBOL[to_ccy])}\s?[\d,]+\.\d{{2}})",
        text, re.I,
    )
    fee_minor = _parse_money(fee_match.group(1), to_ccy) if fee_match else None

    rate_match = re.search(r"(\d+\.\d{4})", text)
    rate = float(rate_match.group(1)) if rate_match else None

    return {
        "from_currency": from_ccy,
        "to_currency": to_ccy,
        "from_amount_minor": from_amount,
        "to_amount_minor": to_amount,
        "fee_minor": fee_minor,
        "effective_rate": rate,
        "card_text": text,
    }


async def _run_flow(page: Page) -> dict:
    result: dict = {"steps": [], "passed": False}

    await page.goto(f"{BASE_URL}/hive", wait_until="domcontentloaded")
    composer = page.get_by_placeholder(re.compile(r"send .* to ", re.I))
    await composer.wait_for(state="visible", timeout=15_000)
    await _dismiss_onboarding(page)

    prompt = f"convert {AMOUNT_MAJOR:g} {FROM} to {TO}"
    await composer.fill(prompt)
    await page.keyboard.press("Enter")
    _log("prompt", prompt)

    confirm = page.get_by_role("button", name=re.compile(r"^Confirm$"))
    await confirm.first.wait_for(state="visible", timeout=20_000)
    await page.screenshot(path=str(SCREENSHOTS / "01_quote.png"))

    intent = await _capture_intent_from_card(page, FROM, TO)
    result["parsed_intent"] = {k: v for k, v in intent.items() if k != "card_text"}
    _log("intent", json.dumps(result["parsed_intent"]))
    for field in ("from_amount_minor", "to_amount_minor", "fee_minor", "effective_rate"):
        if intent[field] is None:
            result["error"] = f"could not read {field} from confirmation card"
            result["card_text"] = intent["card_text"][:800]
            return result
    result["steps"].append("card-parsed")

    await confirm.first.click()
    dialog = page.get_by_role("dialog", name=re.compile(r"Authorize", re.I))
    await dialog.first.wait_for(state="visible", timeout=10_000)
    await _type_pin(page, PIN)
    await dialog.first.wait_for(state="hidden", timeout=15_000)
    result["steps"].append("pin-accepted")

    success = page.get_by_text(re.compile(r"^✓\s+Converted\s+", re.I)).first
    await success.wait_for(state="visible", timeout=15_000)
    await page.screenshot(path=str(SCREENSHOTS / "02_posted.png"))
    result["passed"] = True
    return result


def _fetch_posted_fx(supabase_url: str, publishable: str, access_token: str) -> dict | None:
    import requests
    h = {"apikey": publishable, "Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    r = requests.get(
        f"{supabase_url}/rest/v1/transactions",
        params={"select": "id,type,state,metadata,created_at", "type": "eq.fx",
                "order": "created_at.desc", "limit": "1"},
        headers=h, timeout=10,
    )
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None


def _compare(intent: dict, tx_meta: dict, expected: dict) -> dict:
    checks = {
        "from_currency": intent["from_currency"] == tx_meta.get("from_currency"),
        "to_currency": intent["to_currency"] == tx_meta.get("to_currency"),
        "from_amount_minor": intent["from_amount_minor"] == tx_meta.get("from_amount_minor"),
        "to_amount_minor": intent["to_amount_minor"] == tx_meta.get("to_amount_minor"),
        "fee_minor": intent["fee_minor"] == tx_meta.get("fee_minor"),
        # Card renders a 4dp rate; server keeps full precision. Compare at 4dp.
        "effective_rate": intent["effective_rate"] is not None
            and round(float(tx_meta.get("effective_rate") or 0), 4) == intent["effective_rate"],
        # Independent oracle: card values also match the mid × (1 - spread) quote.
        "matches_expected_to_minor": intent["to_amount_minor"] == expected["to_minor"],
        "matches_expected_fee_minor": intent["fee_minor"] == expected["fee_minor"],
    }
    return {"ok": all(checks.values()), "checks": checks}


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
            result = await _run_flow(page)
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
                    tx = _fetch_posted_fx(supabase_url, publishable, access_token)
                    if not tx:
                        result["passed"] = False
                        result["error"] = "no fx transaction found after post"
                    else:
                        meta = tx.get("metadata") or {}
                        cmp = _compare(result["parsed_intent"], meta, expected)
                        result["transaction_id"] = tx["id"]
                        result["tx_metadata"] = {
                            "from_currency": meta.get("from_currency"),
                            "to_currency": meta.get("to_currency"),
                            "from_amount_minor": meta.get("from_amount_minor"),
                            "to_amount_minor": meta.get("to_amount_minor"),
                            "fee_minor": meta.get("fee_minor"),
                            "effective_rate": meta.get("effective_rate"),
                        }
                        result["comparison"] = cmp
                        if not cmp["ok"]:
                            result["passed"] = False
                            result["error"] = "parsed intent ↔ posted fx quote mismatch"
                except Exception as exc:
                    result["passed"] = False
                    result["error"] = f"verify error: {exc!r}"

        await browser.close()

    _log("result", json.dumps(result, default=str))
    return 0 if result.get("passed") else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
