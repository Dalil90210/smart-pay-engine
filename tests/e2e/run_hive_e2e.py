"""
Python Playwright runner for the Hive e2e flow.

Executes the parsed-intent → confirmation card → PIN → ledger post path,
plus a rapid double-click on Confirm to prove the idempotency guard blocks
a duplicate submit. Mirrors tests/e2e/hive-idempotency.spec.ts but uses
Python Playwright so it runs in the Lovable sandbox (Node Playwright's
bundled Chromium is missing shared libs there; Python Playwright's Chromium
is preinstalled on PLAYWRIGHT_BROWSERS_PATH=/).

Usage:
    python tests/e2e/run_hive_e2e.py

Requires:
    LOVABLE_BROWSER_AUTH_STATUS=injected  (sign in to the preview once)
    LOVABLE_BROWSER_SUPABASE_STORAGE_KEY
    LOVABLE_BROWSER_SUPABASE_SESSION_JSON
    LOVABLE_BROWSER_SUPABASE_COOKIES_JSON  (optional; for SSR apps)

Optional:
    PLAYWRIGHT_BASE_URL   default http://localhost:8080
    PLAYWRIGHT_TEST_PIN   default 1234
    HIVE_PROMPT           default "Send 1 USD to the first payee"
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout


BASE_URL = os.environ.get("PLAYWRIGHT_BASE_URL", "http://localhost:8080")
PIN = os.environ.get("PLAYWRIGHT_TEST_PIN", "1234")
PROMPT = os.environ.get("HIVE_PROMPT", "Send 1 USD to the first payee")
SCREENSHOTS = Path("/tmp/browser/hive-e2e")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


def _log(step: str, detail: str = "") -> None:
    print(f"[hive-e2e] {step}" + (f" — {detail}" if detail else ""), flush=True)


async def _restore_session(context, page: Page) -> bool:
    """Inject a Supabase session. Prefer the Lovable-managed one; if it's
    absent (LOVABLE_BROWSER_AUTH_STATUS=signed_out), mint a session directly
    against Supabase using a deterministic test account, so the runner is
    self-sufficient inside CI/sandbox."""
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")

    if not storage_key or not session_json:
        minted = _mint_session_via_supabase()
        if not minted:
            return False
        storage_key, session_json = minted
        cookies_json = None
        _log("auth-minted", "self-signed via Supabase publishable key")
    else:
        _log("auth-injected", "using Lovable-managed session")

    if cookies_json:
        try:

            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = BASE_URL
            await context.add_cookies(cookies)
        except Exception as exc:
            _log("cookie-warn", str(exc))

    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.evaluate(
        "([k, v]) => window.localStorage.setItem(k, v)",
        [storage_key, session_json],
    )
    _log("auth-injected")
    return True


async def _type_pin(page: Page, pin: str) -> None:
    dialog = page.get_by_role("dialog")
    await dialog.wait_for(state="visible", timeout=10_000)
    otp = dialog.locator('input[inputmode="numeric"]').first
    await otp.click()
    await page.keyboard.type(pin, delay=25)


async def _expect_toast(page: Page, pattern: str, timeout: float = 6_000) -> None:
    toast = page.locator("li[data-sonner-toast], [data-sonner-toast]").filter(has_text=__import__("re").compile(pattern, __import__("re").I))
    await toast.first.wait_for(state="visible", timeout=timeout)


async def _run_flow(page: Page) -> dict:
    result: dict = {"steps": [], "passed": False}

    # 1. Land on /hive.
    await page.goto(f"{BASE_URL}/hive", wait_until="domcontentloaded")
    composer = page.get_by_placeholder(__import__("re").compile(r"send .* to ", __import__("re").I))
    await composer.wait_for(state="visible", timeout=15_000)
    await page.screenshot(path=str(SCREENSHOTS / "01_hive_loaded.png"))
    result["steps"].append("hive-loaded")

    # 2. Type prompt → parsed intent.
    await composer.fill(PROMPT)
    await page.keyboard.press("Enter")
    _log("prompt-sent", PROMPT)

    confirm = page.get_by_role("button", name=__import__("re").compile(r"^Confirm$"))
    await confirm.first.wait_for(state="visible", timeout=20_000)
    await page.screenshot(path=str(SCREENSHOTS / "02_confirmation_card.png"))
    result["steps"].append("confirmation-rendered")

    # 3. Rapid double-click on Confirm — idempotency guard must swallow the second.
    await confirm.first.click()
    try:
        await confirm.first.click(force=True, timeout=500)
    except PWTimeout:
        pass  # guard removed it in time — also acceptable

    # 4. Exactly one PIN dialog should be open.
    dialogs = page.get_by_role("dialog", name=__import__("re").compile(r"Authorize via Smart Pay Engine", __import__("re").I))
    dialog_count = await dialogs.count()
    _log("pin-dialogs", str(dialog_count))
    result["steps"].append(f"pin-dialogs={dialog_count}")
    if dialog_count != 1:
        await page.screenshot(path=str(SCREENSHOTS / "03_dialog_count_fail.png"))
        result["error"] = f"expected 1 PIN dialog, got {dialog_count}"
        return result

    await page.screenshot(path=str(SCREENSHOTS / "03_pin_dialog.png"))

    # 5. Enter correct PIN → ledger post.
    await _type_pin(page, PIN)
    await dialogs.first.wait_for(state="hidden", timeout=15_000)
    result["steps"].append("pin-accepted")

    # 6. Success line in transcript, Confirm cleared.
    success = page.get_by_text(__import__("re").compile(r"^✓\s+Sent\s+", __import__("re").I)).first
    await success.wait_for(state="visible", timeout=15_000)
    remaining = await page.get_by_role("button", name=__import__("re").compile(r"^Confirm$")).count()
    await page.screenshot(path=str(SCREENSHOTS / "04_posted.png"))
    result["steps"].append(f"remaining-confirm-buttons={remaining}")

    result["passed"] = remaining == 0
    if not result["passed"]:
        result["error"] = f"expected 0 lingering Confirm CTAs, got {remaining}"
    return result


def _find_chromium() -> str | None:
    """Locate the sandbox-provided headless_shell; the docs say launch() finds
    it automatically, but on this host PLAYWRIGHT_BROWSERS_PATH=/ points at
    version-suffixed dirs that don't exist, so we glob the nix store fallback."""
    import glob
    hits = glob.glob("/nix/store/*-playwright-chromium-headless-shell/chrome-linux/headless_shell")
    return hits[0] if hits else None


async def main() -> int:
    async with async_playwright() as pw:
        launch_kwargs: dict = {"headless": True}
        exe = _find_chromium()
        if exe:
            launch_kwargs["executable_path"] = exe
            _log("chromium", exe)
        browser = await pw.chromium.launch(**launch_kwargs)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        ok = await _restore_session(context, page)
        if not ok:
            _log("skip", "sign in to the preview so LOVABLE_BROWSER_AUTH_STATUS=injected, then re-run")
            await browser.close()
            return 2

        try:
            result = await _run_flow(page)
        except Exception as exc:
            await page.screenshot(path=str(SCREENSHOTS / "99_crash.png"))
            _log("crash", repr(exc))
            await browser.close()
            return 1

        await browser.close()

    _log("result", json.dumps(result))
    return 0 if result.get("passed") else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
