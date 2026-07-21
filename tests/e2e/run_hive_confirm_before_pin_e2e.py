"""
Hive assistant guard-rail check: for a variety of natural-language commands,
the parsed confirmation card MUST appear BEFORE the PIN dialog is ever
requested. This is the security invariant users rely on — no PIN prompt
should be triggered by a raw prompt without a visible confirmation first.

Reuses the auth-mint + PIN seeding helpers from run_hive_e2e.py.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path

# Reuse the mature session/PIN bootstrap in the sibling runner.
sys.path.insert(0, str(Path(__file__).parent))
from run_hive_e2e import _restore_session, _find_chromium, BASE_URL, _log  # type: ignore

from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout

SCREENSHOTS = Path("/tmp/browser/hive-confirm-before-pin")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

PROMPTS = [
    "Send 1 USD to the first payee",
    "Convert 5 USD to EUR",
    "Send 2 dollars to Maria",
    "Exchange 3 GBP into USD",
]


async def _dismiss_onboarding(page: Page) -> None:
    try:
        get_started = page.get_by_role("button", name=re.compile(r"Get started", re.I))
        await get_started.first.click(timeout=1_500)
        for _ in range(4):
            nxt = page.get_by_role("button", name=re.compile(r"^(Next|Finish|Done|Continue)$", re.I))
            if await nxt.count() == 0:
                break
            try:
                await nxt.first.click(timeout=1_000)
            except PWTimeout:
                break
    except PWTimeout:
        pass


async def _check_prompt(page: Page, prompt: str, idx: int) -> dict:
    step: dict = {"prompt": prompt, "ok": False}
    composer = page.get_by_placeholder(re.compile(r"send .* to ", re.I))
    await composer.wait_for(state="visible", timeout=15_000)
    await composer.fill(prompt)
    await page.keyboard.press("Enter")

    pin_dialog = page.get_by_role(
        "dialog", name=re.compile(r"Authorize via Smart Pay Engine", re.I)
    )
    confirm = page.get_by_role("button", name=re.compile(r"^Confirm$")).last

    # Race: whichever appears first tells us if the assistant behaved.
    try:
        await confirm.wait_for(state="visible", timeout=20_000)
    except PWTimeout:
        # No confirm card — check if it went straight to PIN (bad) or clarified (ok-ish).
        if await pin_dialog.count() > 0:
            step["error"] = "PIN dialog opened without a confirmation card"
            await page.screenshot(path=str(SCREENSHOTS / f"{idx:02d}_pin_without_confirm.png"))
            return step
        # No confirm, no PIN → assistant asked a clarification or declined. That's fine.
        step["ok"] = True
        step["outcome"] = "no-confirm-no-pin (clarification/unknown intent)"
        await page.screenshot(path=str(SCREENSHOTS / f"{idx:02d}_clarification.png"))
        return step

    # Confirm card is visible. Assert PIN dialog is NOT already open.
    if await pin_dialog.count() > 0 and await pin_dialog.first.is_visible():
        step["error"] = "PIN dialog was open before user clicked Confirm"
        await page.screenshot(path=str(SCREENSHOTS / f"{idx:02d}_pin_before_click.png"))
        return step

    await page.screenshot(path=str(SCREENSHOTS / f"{idx:02d}_confirm_card.png"))
    step["ok"] = True
    step["outcome"] = "confirmation-card-first"

    # Clean up: click Cancel (or Discard) so the next prompt starts clean, without posting.
    cancel = page.get_by_role("button", name=re.compile(r"^(Cancel|Discard|Dismiss)$", re.I)).last
    try:
        await cancel.click(timeout=1_500)
    except PWTimeout:
        pass
    return step


async def main() -> int:
    async with async_playwright() as pw:
        launch_kwargs: dict = {"headless": True}
        exe = _find_chromium()
        if exe:
            launch_kwargs["executable_path"] = exe
        browser = await pw.chromium.launch(**launch_kwargs)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        if not await _restore_session(context, page):
            _log("skip", "no Supabase session available")
            await browser.close()
            return 2

        await page.goto(f"{BASE_URL}/hive", wait_until="domcontentloaded")
        await _dismiss_onboarding(page)

        results = []
        for i, prompt in enumerate(PROMPTS, start=1):
            _log("prompt", prompt)
            res = await _check_prompt(page, prompt, i)
            _log("result", json.dumps(res))
            results.append(res)

        await browser.close()

    passed = all(r["ok"] for r in results)
    print(json.dumps({"passed": passed, "results": results}, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
