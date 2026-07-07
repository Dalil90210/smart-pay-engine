import { test, expect, typePin, expectToast } from "./fixtures";

// These tests exercise the real PIN gate for the Send money flow.
// A valid 4-digit PIN must be set on the signed-in user. Override with
// PLAYWRIGHT_TEST_PIN / PLAYWRIGHT_WRONG_PIN if your seed differs.
const CORRECT_PIN = process.env.PLAYWRIGHT_TEST_PIN || "1234";
const WRONG_PIN = process.env.PLAYWRIGHT_WRONG_PIN || "9999";

test.describe("Send money — PIN authorization", () => {
  test.beforeEach(async ({ authed, page }) => {
    void authed;
    await page.goto("/send");
    await expect(page.getByRole("heading", { name: /Send money/i })).toBeVisible();
  });

  async function reachReviewStep(page: import("@playwright/test").Page) {
    // Pick the first payee if the picker exposes options; otherwise assume a default is preselected.
    const firstPayee = page.getByRole("radio").first();
    if (await firstPayee.count()) {
      await firstPayee.click().catch(() => {});
    }
    await page.getByPlaceholder("0.00").fill("1");
    await page.getByRole("button", { name: /^Review$/ }).click();
    await expect(page.getByRole("button", { name: /Confirm & send/i })).toBeVisible();
  }

  test("wrong PIN keeps the dialog open and shows an error", async ({ page }) => {
    await reachReviewStep(page);
    await page.getByRole("button", { name: /Confirm & send/i }).click();
    await expect(page.getByRole("dialog", { name: /Authorize transfer/i })).toBeVisible();
    await typePin(page, WRONG_PIN);
    await expectToast(page, /Incorrect PIN/i);
    // Dialog remains open for retry
    await expect(page.getByRole("dialog", { name: /Authorize transfer/i })).toBeVisible();
  });

  test("correct PIN closes the dialog and posts the transfer", async ({ page }) => {
    await reachReviewStep(page);
    await page.getByRole("button", { name: /Confirm & send/i }).click();
    await typePin(page, CORRECT_PIN);
    await expect(page.getByRole("dialog", { name: /Authorize transfer/i })).toBeHidden({
      timeout: 10_000,
    });
    // Either success toast or navigation away from review step.
    await expect
      .poll(
        async () => {
          const toast = await page
            .locator("[data-sonner-toast]")
            .filter({ hasText: /sent|posted|success/i })
            .count();
          const stillOnReview = await page
            .getByRole("button", { name: /Confirm & send/i })
            .isVisible()
            .catch(() => false);
          return toast > 0 || !stillOnReview;
        },
        { timeout: 10_000 },
      )
      .toBeTruthy();
  });
});
