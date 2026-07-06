"""
Wrong-PIN check for the Hive FX Convert flow.

Verifies that entering an INCORRECT PIN during Hive FX confirmation:
  * shows the "Incorrect PIN" error toast,
  * does NOT post any `fx` transaction,
  * does NOT create any ledger entries.

Strategy:
  1. Snapshot `fx` transactions AND ledger_entries counts before the flow.
  2. Drive Hive: prompt → Confirm → PIN modal → type WRONG pin (auto-submits
     on the 4th digit; PinModal calls verify_pin and shows an error toast on
     mismatch, keeping the dialog open).
  3. Also directly invoke post_fx_conversion with the wrong PIN via the
     authenticated browser client to prove the server RPC itself rejects it.
  4. Re-snapshot: zero new fx tx, zero new ledger entries.

Usage:
    python tests/e2e/run_hive_convert_wrong_pin_e2e.py
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import uuid
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
    _type_pin,
)

WRONG_PIN = "0000" if PIN != "0000" else "1111"
SCREENSHOTS = Path("/tmp/browser/hive-convert-wrong-pin-e2e")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("HIVE_TEST_EMAIL", "hive-convert-wrong-pin-e2e@test.smartpay.local")
os.environ.setdefault("HIVE_TEST_PASSWORD", "hive-convert-wrong-pin-e2e-Passw0rd!")


def _log(step: str, detail: str = "") -> None:
    print(f"[hive-convert-wrong-pin-e2e] {step}" + (f" — {detail}" if detail else ""), flush=True)


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
         "order": "created_at.desc", "limit": "50"},
    )


def _ledger_entries(url: str, publishable: str, access_token: str) -> list:
    return _rest(
        url, publishable, access_token, "ledger_entries",
        {"select": "id,transaction_id,created_at", "order": "created_at.desc", "limit": "200"},
    )


async def _run_wrong_pin_ui(page: Page) -> dict:
    result: dict = {"steps": [], "passed": False}

    await page.goto(f"{BASE_URL}/hive", wait_until="domcontentloaded")
    composer = page.get_by_placeholder(re.compile(r"send .* to ", re.I))
    await composer.wait_for(state="visible", timeout=15_000)
    await _dismiss_onboarding(page)
    result["steps"].append("hive-loaded")

    prompt = f"convert {AMOUNT_MAJOR:g} {FROM} to {TO}"
    await composer.fill(prompt)
    await page.keyboard.press("Enter")

    confirm = page.get_by_role("button", name=re.compile(r"^Confirm$"))
    await confirm.first.wait_for(state="visible", timeout=20_000)
    await page.screenshot(path=str(SCREENSHOTS / "01_quote.png"))
    result["steps"].append("quote-rendered")

    await confirm.first.click()
    dialog = page.get_by_role("dialog", name=re.compile(r"Authorize", re.I))
    await dialog.first.wait_for(state="visible", timeout=10_000)
    await page.screenshot(path=str(SCREENSHOTS / "02_pin_open.png"))

    await _type_pin(page, WRONG_PIN)
    result["steps"].append(f"wrong-pin-entered={WRONG_PIN}")

    # Expect the "Incorrect PIN" toast; dialog should stay open (no post).
    toast = page.locator("li[data-sonner-toast], [data-sonner-toast]").filter(
        has_text=re.compile(r"Incorrect\s+PIN", re.I)
    )
    try:
        await toast.first.wait_for(state="visible", timeout=8_000)
        result["steps"].append("incorrect-pin-toast-visible")
    except Exception:
        await page.screenshot(path=str(SCREENSHOTS / "03_no_toast.png"))
        result["error"] = "expected 'Incorrect PIN' toast did not appear"
        return result

    await page.screenshot(path=str(SCREENSHOTS / "03_pin_rejected.png"))

    # Verify no success text appears within a short window.
    success = page.get_by_text(re.compile(r"^✓\s+Converted\s+", re.I))
    try:
        await success.first.wait_for(state="visible", timeout=2_000)
        result["error"] = "success message unexpectedly appeared after wrong PIN"
        return result
    except Exception:
        result["steps"].append("no-success-message")

    result["passed"] = True
    return result


async def _rpc_with_wrong_pin(page: Page) -> dict:
    """Also call post_fx_conversion directly with the wrong PIN and a fresh
    idempotency key from the authenticated browser context. The server RPC
    must reject and MUST NOT insert any rows."""
    fresh_key = f"wrong-pin-e2e-{uuid.uuid4()}"
    return await page.evaluate(
        """async ({ key, pin, from_, to, fromMinor }) => {
            const mod = await import('/src/integrations/supabase/client.ts');
            const sb = mod.supabase;
            const verify = await sb.rpc('verify_pin', { p_pin: pin });
            const post = await sb.rpc('post_fx_conversion', {
                p_idempotency_key: key,
                p_from_currency: from_,
                p_to_currency: to,
                p_from_amount_minor: fromMinor,
                p_pin: pin,
            });
            return {
                key,
                verify: { data: verify.data, error: verify.error ? verify.error.message : null },
                post: { data: post.data, error: post.error ? post.error.message : null },
            };
        }""",
        {"key": fresh_key, "pin": WRONG_PIN, "from_": FROM, "to": TO, "fromMinor": AMOUNT_MINOR},
    )


def _verify(url: str, publishable: str, access_token: str,
            fx_before: list, ledger_before: list, rpc_result: dict) -> dict:
    fx_after = _fx_transactions(url, publishable, access_token)
    ledger_after = _ledger_entries(url, publishable, access_token)

    fx_before_ids = {t["id"] for t in fx_before}
    new_fx = [t for t in fx_after if t["id"] not in fx_before_ids]

    ledger_before_ids = {e["id"] for e in ledger_before}
    new_ledger = [e for e in ledger_after if e["id"] not in ledger_before_ids]

    verify_data = (rpc_result.get("verify") or {}).get("data")
    post_err = (rpc_result.get("post") or {}).get("error")
    post_data = (rpc_result.get("post") or {}).get("data")

    report = {
        "fx_before": len(fx_before),
        "fx_after": len(fx_after),
        "new_fx_count": len(new_fx),
        "ledger_before": len(ledger_before),
        "ledger_after": len(ledger_after),
        "new_ledger_count": len(new_ledger),
        "verify_pin_result": verify_data,
        "post_fx_error": post_err,
        "post_fx_data": post_data,
    }

    ok = (
        len(new_fx) == 0
        and len(new_ledger) == 0
        and verify_data is False
        and post_err is not None
        and post_data is None
    )
    report["ok"] = ok
    if not ok:
        report["error"] = (
            f"new_fx={len(new_fx)} new_ledger={len(new_ledger)} "
            f"verify_pin={verify_data!r} post_err={post_err!r}"
        )
        report["new_fx"] = new_fx
        report["new_ledger_sample"] = new_ledger[:8]
    return report


async def main() -> int:
    if (FROM, TO) not in MID_RATES:
        _log("skip", f"unsupported pair {FROM}->{TO}")
        return 2

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

    fx_before = _fx_transactions(supabase_url, publishable, access_token)
    ledger_before = _ledger_entries(supabase_url, publishable, access_token)
    _log("snapshot", f"fx={len(fx_before)} ledger={len(ledger_before)} wrong_pin={WRONG_PIN}")

    async with async_playwright() as pw:
        launch_kwargs: dict = {"headless": True}
        exe = _find_chromium()
        if exe:
            launch_kwargs["executable_path"] = exe
        browser = await pw.chromium.launch(**launch_kwargs)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        if not await _restore_session(context, page):
            await browser.close()
            _log("skip", "no session in browser")
            return 2

        try:
            result = await _run_wrong_pin_ui(page)
        except Exception as exc:
            await page.screenshot(path=str(SCREENSHOTS / "99_crash.png"))
            _log("crash", repr(exc))
            await browser.close()
            return 1

        if not result.get("passed"):
            await browser.close()
            _log("result", json.dumps(result))
            return 1

        try:
            rpc_result = await _rpc_with_wrong_pin(page)
            result["rpc"] = rpc_result
            result["steps"].append("rpc-wrong-pin-invoked")
        except Exception as exc:
            await page.screenshot(path=str(SCREENSHOTS / "98_rpc_crash.png"))
            _log("rpc-crash", repr(exc))
            await browser.close()
            return 1

        await browser.close()

    check = _verify(supabase_url, publishable, access_token, fx_before, ledger_before, rpc_result)
    result["verification"] = check
    if not check.get("ok"):
        result["passed"] = False
        result["error"] = f"wrong-pin isolation failed: {check.get('error')}"

    _log("result", json.dumps(result))
    return 0 if result.get("passed") else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
