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


def _mint_session_via_supabase() -> tuple[str, str] | None:
    """Sign in (or bootstrap + sign in) a deterministic test account against
    Supabase Auth and return (storage_key, session_json) shaped exactly like
    supabase-js writes to localStorage. Also ensures the test PIN is set so
    the Hive Confirm → PIN → post flow can complete."""
    import urllib.parse
    try:
        import requests
    except Exception as exc:
        _log("mint-skip", f"requests unavailable: {exc}")
        return None

    supabase_url = os.environ.get("SUPABASE_URL")
    publishable = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    service_role = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    project_id = (
        os.environ.get("SUPABASE_PROJECT_ID")
        or os.environ.get("VITE_SUPABASE_PROJECT_ID")
        or ""
    )
    if not project_id and supabase_url:
        # extract from https://<ref>.supabase.co
        host = urllib.parse.urlparse(supabase_url).hostname or ""
        project_id = host.split(".")[0]

    if not supabase_url or not publishable or not project_id:
        _log("mint-skip", "SUPABASE_URL / PUBLISHABLE_KEY / PROJECT_ID missing")
        return None

    email = os.environ.get("HIVE_TEST_EMAIL", "hive-e2e@test.smartpay.local")
    password = os.environ.get("HIVE_TEST_PASSWORD", "hive-e2e-Passw0rd!")

    def token_password_grant() -> dict | None:
        r = requests.post(
            f"{supabase_url}/auth/v1/token?grant_type=password",
            headers={"apikey": publishable, "Content-Type": "application/json"},
            json={"email": email, "password": password},
            timeout=15,
        )
        return r.json() if r.status_code == 200 else None

    session = token_password_grant()
    if not session:
        # Bootstrap via service role admin API (email pre-confirmed so signIn works immediately).
        if not service_role:
            _log("mint-skip", "no session and no SUPABASE_SERVICE_ROLE_KEY to bootstrap")
            return None
        r = requests.post(
            f"{supabase_url}/auth/v1/admin/users",
            headers={"apikey": service_role, "Authorization": f"Bearer {service_role}", "Content-Type": "application/json"},
            json={"email": email, "password": password, "email_confirm": True},
            timeout=15,
        )
        if r.status_code not in (200, 201, 422):
            _log("mint-fail", f"admin create-user {r.status_code}: {r.text[:200]}")
            return None
        # 422 means user already exists — fine, we'll sign in below.
        session = token_password_grant()
        if not session:
            _log("mint-fail", "password grant still failed after bootstrap")
            return None

    access_token = session.get("access_token")
    if not access_token:
        _log("mint-fail", f"no access_token in session response: {list(session)}")
        return None

    # Ensure the test PIN is set so the Confirm → PIN dialog can succeed.
    # public.set_pin() uses gen_salt/crypt from pgcrypto which lives in the
    # `extensions` schema, and the function's `SET search_path = public` hides
    # it — the RPC returns 404. Write user_pins directly via psql, schema-
    # qualifying the crypto calls.
    user_id = (session.get("user") or {}).get("id")
    db_url = os.environ.get("SUPABASE_DB_URL")
    if user_id and db_url:
        try:
            import subprocess
            sql = (
                "INSERT INTO public.user_pins(user_id, pin_hash, updated_at) "
                f"VALUES ('{user_id}'::uuid, extensions.crypt('{PIN}', extensions.gen_salt('bf')), now()) "
                "ON CONFLICT (user_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = now();"
            )
            res = subprocess.run(
                ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-c", sql],
                capture_output=True, text=True, timeout=15,
            )
            if res.returncode != 0:
                _log("pin-warn", f"psql set_pin failed: {res.stderr[:200]}")
            else:
                _log("pin-set", "ok")
        except Exception as exc:
            _log("pin-warn", f"psql set_pin threw: {exc}")
    else:
        _log("pin-warn", "SUPABASE_DB_URL or user id missing — cannot seed PIN")



    # Mark the profile as onboarded so AppShell's OnboardingModal (PIN/setup wizard)
    # doesn't cover the Confirm button. profiles.onboarded_at is the sole trigger.
    try:
        requests.patch(
            f"{supabase_url}/rest/v1/profiles?id=eq.{session.get('user', {}).get('id')}",
            headers={
                "apikey": publishable,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json={"onboarded_at": "now()"},
            timeout=10,
        )
    except Exception as exc:
        _log("onboard-warn", f"profiles patch failed: {exc}")


    storage_key = f"sb-{project_id}-auth-token"
    return storage_key, json.dumps(session)



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

    # First-run onboarding modal covers the Confirm button; dismiss it if present.
    try:
        get_started = page.get_by_role("button", name=__import__("re").compile(r"Get started", __import__("re").I))
        await get_started.first.click(timeout=1_500)
        # Click through any remaining onboarding steps.
        for _ in range(4):
            nxt = page.get_by_role("button", name=__import__("re").compile(r"^(Next|Finish|Done|Continue)$", __import__("re").I))
            if await nxt.count() == 0:
                break
            try:
                await nxt.first.click(timeout=1_000)
            except PWTimeout:
                break
        result["steps"].append("onboarding-dismissed")
    except PWTimeout:
        pass

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
