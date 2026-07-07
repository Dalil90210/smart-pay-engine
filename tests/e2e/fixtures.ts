import { test as base, expect, Page, BrowserContext } from "@playwright/test";

/**
 * Restores the injected Lovable-managed Supabase session (see browser-use docs)
 * so protected routes are reachable without going through the auth UI.
 * When the session env vars are absent (e.g. LOVABLE_BROWSER_AUTH_STATUS=signed_out)
 * tests that need auth are skipped rather than failing.
 */
export async function restoreSupabaseSession(context: BrowserContext, page: Page) {
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080";

  if (!storageKey || !sessionJson) {
    return false;
  }

  if (cookiesJson) {
    try {
      const cookies = JSON.parse(cookiesJson).map((c: Record<string, unknown>) => ({
        ...c,
        url: baseURL,
      }));
      await context.addCookies(cookies);
    } catch {
      // ignore
    }
  }

  await page.goto(baseURL);
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k as string, v as string),
    [storageKey, sessionJson],
  );
  return true;
}

/**
 * Types a PIN into the currently-visible input-otp dialog.
 */
export async function typePin(page: Page, pin: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const otp = dialog.locator('input[inputmode="numeric"]');
  await otp.first().click();
  await page.keyboard.type(pin, { delay: 20 });
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(
    page.locator("li[data-sonner-toast], [data-sonner-toast]").filter({ hasText: text }),
  ).toBeVisible({
    timeout: 5_000,
  });
}

type Fixtures = {
  authed: { skip: boolean };
};

export const test = base.extend<Fixtures>({
  authed: async ({ context, page }, applyFixture) => {
    const ok = await restoreSupabaseSession(context, page);
    if (!ok) {
      test.skip(
        true,
        "No Lovable-managed Supabase session in env (LOVABLE_BROWSER_AUTH_STATUS != injected). " +
          "Sign in to the preview so the sandbox session is minted, then re-run.",
      );
    }
    await applyFixture({ skip: !ok });
  },
});

export { expect };
