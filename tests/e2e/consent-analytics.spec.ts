import { test, expect } from "@playwright/test";

/**
 * Verifies Google Analytics Consent Mode v2 gating on the public policy routes.
 *
 * Contract:
 *  - Before an analytics choice is stored, every /g/collect ping must carry
 *    gcs=G100 (analytics_storage denied).
 *  - After granting analytics consent, subsequent pings must carry gcs=G101.
 *
 * The banner writes to localStorage under `spe.consent.v1` and dispatches a
 * `spe:consent-change` event; the __root inline bootstrap replays this into
 * gtag('consent','update',...) so we simulate the exact same path here.
 */

const POLICY_ROUTES = ["/privacy", "/cookies"] as const;
const CONSENT_KEY = "spe.consent.v1";

type Ping = { url: string; gcs: string | null };

async function collectPings(page: import("@playwright/test").Page, action: () => Promise<void>) {
  const pings: Ping[] = [];
  const onRequest = (req: import("@playwright/test").Request) => {
    const url = req.url();
    if (!/\/g\/collect/.test(url)) return;
    const u = new URL(url);
    pings.push({ url, gcs: u.searchParams.get("gcs") });
  };
  page.on("request", onRequest);
  try {
    await action();
    // Give GA a moment to flush any queued beacons.
    await page.waitForTimeout(1500);
  } finally {
    page.off("request", onRequest);
  }
  return pings;
}

test.describe("Analytics consent gating on policy pages", () => {
  for (const route of POLICY_ROUTES) {
    test(`${route} — pings are consent-denied (gcs=G100) before opt-in`, async ({
      page,
      context,
    }) => {
      // Ensure a completely fresh consent state.
      await context.clearCookies();
      await page.addInitScript(() => {
        try {
          window.localStorage.removeItem("spe.consent.v1");
        } catch {
          /* noop */
        }
      });

      const pings = await collectPings(page, async () => {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        // Trigger an interaction so GA has something to send beyond page_view.
        await page.mouse.move(200, 200);
        await page.mouse.move(400, 400);
      });

      expect(pings.length, `expected at least one /g/collect ping on ${route}`).toBeGreaterThan(0);
      for (const p of pings) {
        expect(p.gcs, `pre-consent ping should be denied on ${route} (${p.url})`).toBe("G100");
      }
    });

    test(`${route} — pings become granted (gcs=G101) after analytics opt-in`, async ({
      page,
      context,
    }) => {
      await context.clearCookies();
      await page.addInitScript(() => {
        try {
          window.localStorage.removeItem("spe.consent.v1");
        } catch {
          /* noop */
        }
      });

      await page.goto(route, { waitUntil: "domcontentloaded" });

      // Grant analytics consent through the same code path the banner uses:
      // write the storage key, then push gtag('consent','update',...).
      await page.evaluate((key) => {
        const state = {
          necessary: true,
          analytics: true,
          ads: false,
          decidedAt: new Date().toISOString(),
          version: 1,
        };
        window.localStorage.setItem(key, JSON.stringify(state));
        const w = window as unknown as { gtag?: (...args: unknown[]) => void };
        if (typeof w.gtag === "function") {
          w.gtag("consent", "update", {
            analytics_storage: "granted",
            ad_storage: "denied",
            ad_user_data: "denied",
            ad_personalization: "denied",
          });
        }
        window.dispatchEvent(new CustomEvent("spe:consent-change", { detail: state }));
      }, CONSENT_KEY);

      const pings = await collectPings(page, async () => {
        // Force a fresh page_view under the new consent state.
        await page.evaluate(() => {
          const w = window as unknown as { gtag?: (...args: unknown[]) => void };
          if (typeof w.gtag === "function") {
            w.gtag("event", "page_view", { consent_test: true });
          }
        });
        await page.mouse.move(300, 300);
      });

      expect(pings.length, `expected /g/collect pings after consent on ${route}`).toBeGreaterThan(
        0,
      );
      const granted = pings.filter((p) => p.gcs === "G101");
      expect(
        granted.length,
        `expected at least one gcs=G101 ping after opt-in on ${route}; saw: ${pings
          .map((p) => p.gcs)
          .join(",")}`,
      ).toBeGreaterThan(0);
    });
  }
});
