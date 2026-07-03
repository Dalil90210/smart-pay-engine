import { test, expect, typePin, expectToast } from "./fixtures";

const CORRECT_PIN = process.env.PLAYWRIGHT_TEST_PIN || "1234";
const WRONG_PIN = process.env.PLAYWRIGHT_WRONG_PIN || "9999";

test.describe("Convert currency — PIN authorization", () => {
  test.beforeEach(async ({ authed, page }) => {
    void authed;
    await page.goto("/convert");
    await expect(page.getByRole("heading", { name: /Convert currency/i })).toBeVisible();
  });

  async function reachReviewStep(page: import("@playwright/test").Page) {
    await page.getByPlaceholder("0.00").fill("10");
    // "Get quote" / "Review" style CTA — button label may vary; match either.
    const cta = page.getByRole("button", { name: /Review|Get quote|Continue/i }).first();
    await cta.click();
    await expect(page.getByRole("button", { name: /Confirm|Convert/i }).last()).toBeVisible();
  }

  test("wrong PIN shows Incorrect PIN and keeps dialog open", async ({ page }) => {
    await reachReviewStep(page);
    await page.getByRole("button", { name: /Confirm|Convert/i }).last().click();
    await expect(page.getByRole("dialog", { name: /Authorize conversion/i })).toBeVisible();
    await typePin(page, WRONG_PIN);
    await expectToast(page, /Incorrect PIN/i);
    await expect(page.getByRole("dialog", { name: /Authorize conversion/i })).toBeVisible();
  });

  test("correct PIN authorizes the conversion", async ({ page }) => {
    await reachReviewStep(page);
    await page.getByRole("button", { name: /Confirm|Convert/i }).last().click();
    await typePin(page, CORRECT_PIN);
    await expect(page.getByRole("dialog", { name: /Authorize conversion/i })).toBeHidden({ timeout: 10_000 });
    await expect
      .poll(async () => {
        return (
          (await page.locator("[data-sonner-toast]").filter({ hasText: /Converted|success/i }).count()) > 0
        );
      }, { timeout: 10_000 })
      .toBeTruthy();
  });
});
