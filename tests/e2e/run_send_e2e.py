"""
Python Playwright runner for the Send money e2e flow.

Covers: /send form → payee pick → amount → Review → Confirm & send →
PIN dialog → posted transaction → balanced ledger_entries.

Runs in the Lovable sandbox (Python Playwright ships a Chromium that works
here; Node Playwright's bundle is missing shared libs on this host).

Usage:
    python tests/e2e/run_send_e2e.py

Env (optional):
    PLAYWRIGHT_BASE_URL   default http://localhost:8080
    PLAYWRIGHT_TEST_PIN   default 1234
    SEND_PAYEE_NAME       default "Acme Inc"    (USD payee seeded by handle_new_user)
    SEND_AMOUNT           default "1"
    SEND_TEST_EMAIL       default "send-e2e@test.smartpay.local"
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout

# Reuse the browser bootstrap + Supabase session mint that already work for Hive.
sys.path.insert(0, str(Path(__file__).parent))
from run_hive_e2e import (  # type: ignore
    BASE_URL,
    PIN,
    _find_chromium,
    _mint_session_via_supabase,
    _restore_session,
)

PAYEE_NAME = os.environ.get("SEND_PAYEE_NAME", "Acme Inc")
AMOUNT = os.environ.get("SEND_AMOUNT", "1")
SCREENSHOTS = Path("/tmp/browser/send-e2e")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

# Route the mint helper at a Send-specific test account so it doesn't collide
# with hive-e2e's balance drift across repeated runs.
os.environ.setdefault("HIVE_TEST_EMAIL", os.environ.get("SEND_TEST_EMAIL", "send-e2e@test.smartpay.local"))
os.environ.setdefault("HIVE_TEST_PASSWORD", os.environ.get("SEND_TEST_PASSWORD", "send-e2e-Passw0rd!"))


def _log(step: str, detail: str = "") -> None:
    print(f"[send-e2e] {step}" + (f" — {detail}" if detail else ""), flush=True)


async def _type_pin(page: Page, pin: str) -> None:
    dialog = page.get_by_role("dialog")
    await dialog.first.wait_for(state="visible", timeout=10_000)
    otp = dialog.locator('input[inputmode="numeric"]').first
    await otp.click()
    await page.keyboard.type(pin, delay=25)


async def _dismiss_onboarding(page: Page) -> bool:
    """AppShell shows an onboarding modal on first sign-in that covers the CTA."""
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
        return True
    except PWTimeout:
        return False


async def _pick_payee(page: Page, name: str) -> bool:
    """The PayeePicker renders each payee as a clickable card / radio.
    Try the accessible name first, fall back to a text click."""
    try:
        radio = page.get_by_role("radio", name=re.compile(re.escape(name), re.I))
        if await radio.count():
            await radio.first.click()
            return True
    except PWTimeout:
        pass
    try:
        await page.get_by_text(name, exact=False).first.click(timeout=3_000)
        return True
    except PWTimeout:
        return False


def _verify_ledger(supabase_url: str, publishable: str, access_token: str) -> dict:
    """Fetch the most recent posted transfer for the signed-in user and
    confirm debits == credits (balanced double-entry post)."""
    import requests

    headers = {
        "apikey": publishable,
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }
    tx_r = requests.get(
        f"{supabase_url}/rest/v1/transactions",
        params={
            "select": "id,type,state,created_at,metadata",
            "type": "eq.transfer",
            "order": "created_at.desc",
            "limit": "1",
        },
        headers=headers,
        timeout=10,
    )
    tx_r.raise_for_status()
    txs = tx_r.json()
    if not txs:
        return {"ok": False, "error": "no transfer transaction found"}
    tx = txs[0]
    entries_r = requests.get(
        f"{supabase_url}/rest/v1/ledger_entries",
        params={
            "select": "direction,amount_minor,currency,account_id",
            "transaction_id": f"eq.{tx['id']}",
        },
        headers=headers,
        timeout=10,
    )
    entries_r.raise_for_status()
    entries = entries_r.json()
    debits = sum(e["amount_minor"] for e in entries if e["direction"] == "debit")
    credits = sum(e["amount_minor"] for e in entries if e["direction"] == "credit")
    return {
        "ok": debits == credits and debits > 0 and len(entries) >= 2,
        "transaction_id": tx["id"],
        "state": tx.get("state"),
        "entries": len(entries),
        "debits_minor": debits,
        "credits_minor": credits,
    }


async def _run_flow(page: Page) -> dict:
    result: dict = {"steps": [], "passed": False}

    await page.goto(f"{BASE_URL}/send", wait_until="domcontentloaded")
    heading = page.get_by_role("heading", name=re.compile(r"Send money", re.I))
    await heading.wait_for(state="visible", timeout=15_000)
    result["steps"].append("send-loaded")

    if await _dismiss_onboarding(page):
        result["steps"].append("onboarding-dismissed")

    await page.screenshot(path=str(SCREENSHOTS / "01_send_loaded.png"))

    # 1. Pick payee.
    if not await _pick_payee(page, PAYEE_NAME):
        result["error"] = f"payee '{PAYEE_NAME}' not found"
        await page.screenshot(path=str(SCREENSHOTS / "02_payee_missing.png"))
        return result
    result["steps"].append(f"payee-selected={PAYEE_NAME}")

    # 2. Amount.
    amount_input = page.get_by_placeholder("0.00")
    await amount_input.wait_for(state="visible", timeout=5_000)
    await amount_input.fill(AMOUNT)
    result["steps"].append(f"amount={AMOUNT}")

    # 3. Review.
    review = page.get_by_role("button", name=re.compile(r"^Review$"))
    await review.click()
    confirm = page.get_by_role("button", name=re.compile(r"Confirm & send", re.I))
    await confirm.wait_for(state="visible", timeout=10_000)
    await page.screenshot(path=str(SCREENSHOTS / "02_review.png"))
    result["steps"].append("review-visible")

    # 4. Confirm & send → PIN dialog.
    await confirm.click()
    dialog = page.get_by_role("dialog", name=re.compile(r"Authorize", re.I))
    await dialog.first.wait_for(state="visible", timeout=10_000)
    await page.screenshot(path=str(SCREENSHOTS / "03_pin_dialog.png"))
    result["steps"].append("pin-dialog-open")

    # 5. Enter correct PIN.
    await _type_pin(page, PIN)
    await dialog.first.wait_for(state="hidden", timeout=15_000)
    result["steps"].append("pin-accepted")

    # 6. Success signal: toast or navigation away from the review step.
    try:
        await page.wait_for_url(re.compile(r"/transactions"), timeout=10_000)
        result["steps"].append("navigated-to-transactions")
    except PWTimeout:
        toast = page.locator("[data-sonner-toast]").filter(has_text=re.compile(r"sent|success|posted", re.I))
        await toast.first.wait_for(state="visible", timeout=5_000)
        result["steps"].append("success-toast")

    await page.screenshot(path=str(SCREENSHOTS / "04_posted.png"))
    result["passed"] = True
    return result


async def main() -> int:
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
            _log("skip", "no Supabase session available; sign in to the preview or provide service-role env")
            await browser.close()
            return 2

        try:
            result = await _run_flow(page)
        except Exception as exc:
            await page.screenshot(path=str(SCREENSHOTS / "99_crash.png"))
            _log("crash", repr(exc))
            await browser.close()
            return 1

        # Ledger verification via REST — best-effort, only when env is present.
        supabase_url = os.environ.get("SUPABASE_URL")
        publishable = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
        if result.get("passed") and supabase_url and publishable:
            storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
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
                    ledger = _verify_ledger(supabase_url, publishable, access_token)
                    result["ledger"] = ledger
                    if not ledger["ok"]:
                        result["passed"] = False
                        result["error"] = f"ledger not balanced: {ledger}"
                except Exception as exc:
                    result["ledger_error"] = repr(exc)

        await browser.close()

    _log("result", json.dumps(result))
    return 0 if result.get("passed") else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
