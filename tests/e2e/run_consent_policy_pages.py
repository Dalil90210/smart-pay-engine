"""
Verifies analytics consent gating on the public policy routes.

Contract:
  * Before an analytics choice is stored, every /g/collect request must carry
    gcs=G100 (Consent Mode v2 analytics_storage denied).
  * After the same code path the ConsentBanner uses — writing
    localStorage['spe.consent.v1'] + pushing gtag('consent','update',...) —
    subsequent pings must carry gcs=G101.

Run: python3 tests/e2e/run_consent_policy_pages.py
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright

BASE_URL = os.environ.get("PLAYWRIGHT_BASE_URL", "http://localhost:8080")
ROUTES = ("/privacy", "/cookies")
CONSENT_KEY = "spe.consent.v1"

SCREENSHOTS = Path("/tmp/browser/consent-policy")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


def gcs_of(url: str):
    try:
        return parse_qs(urlparse(url).query).get("gcs", [None])[0]
    except Exception:
        return None


async def open_page(context):
    page = await context.new_page()
    pings: list[dict] = []

    def on_request(req):
        if "/g/collect" in req.url:
            pings.append({"url": req.url, "gcs": gcs_of(req.url)})

    page.on("request", on_request)
    return page, pings


async def check_route(context, route: str) -> tuple[bool, str]:
    # --- Phase 1: pre-consent, expect all pings gcs=G100 ---
    page, pings = await open_page(context)
    await page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded")
    await page.mouse.move(200, 200)
    await page.mouse.move(400, 400)
    await page.wait_for_timeout(1800)
    await page.screenshot(path=str(SCREENSHOTS / f"pre{route.replace('/', '_')}.png"))

    if not pings:
        return False, f"{route}: no /g/collect pings observed pre-consent"
    bad = [p for p in pings if p["gcs"] != "G100"]
    if bad:
        return False, f"{route}: pre-consent ping not denied: {bad[:3]}"

    # --- Phase 2: grant analytics consent, expect gcs=G101 ---
    await page.evaluate(
        """(key) => {
            const state = {
                necessary: true, analytics: true, ads: false,
                decidedAt: new Date().toISOString(), version: 1
            };
            window.localStorage.setItem(key, JSON.stringify(state));
            if (typeof window.gtag === 'function') {
                window.gtag('consent','update',{
                    analytics_storage:'granted',
                    ad_storage:'denied',
                    ad_user_data:'denied',
                    ad_personalization:'denied'
                });
            }
            window.dispatchEvent(new CustomEvent('spe:consent-change', { detail: state }));
        }""",
        CONSENT_KEY,
    )

    post_pings: list[dict] = []
    page.on(
        "request",
        lambda req: post_pings.append({"url": req.url, "gcs": gcs_of(req.url)})
        if "/g/collect" in req.url
        else None,
    )

    await page.evaluate(
        """() => {
            if (typeof window.gtag === 'function') {
                window.gtag('event','page_view',{ consent_test: true });
            }
        }"""
    )
    await page.mouse.move(300, 300)
    await page.wait_for_timeout(1800)
    await page.screenshot(path=str(SCREENSHOTS / f"post{route.replace('/', '_')}.png"))

    granted = [p for p in post_pings if p["gcs"] == "G101"]
    if not granted:
        return (
            False,
            f"{route}: no gcs=G101 ping after opt-in; saw {[p['gcs'] for p in post_pings]}",
        )

    await page.close()
    return True, f"{route}: OK ({len(pings)} denied, {len(granted)} granted)"


async def main() -> int:
    exec_path = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH")
    # Fall back to the sandbox's nix-provided chromium when the default
    # PLAYWRIGHT_BROWSERS_PATH points at a stale version.
    for candidate in (
        exec_path,
        "/nix/store/nw961dvpvik5m19kbay4cg27wxgl3sdv-playwright-chromium-headless-shell/chrome-linux/headless_shell",
    ):
        if candidate and Path(candidate).exists():
            exec_path = candidate
            break
        exec_path = None

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=exec_path) if exec_path else await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        results = []
        for route in ROUTES:
            ok, msg = await check_route(context, route)
            print(("PASS " if ok else "FAIL ") + msg)
            results.append(ok)
        await browser.close()
        return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
