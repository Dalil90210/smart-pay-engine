import { test, expect, typePin, expectToast } from "./fixtures";

const CORRECT_PIN = process.env.PLAYWRIGHT_TEST_PIN || "1234";
const WRONG_PIN = process.env.PLAYWRIGHT_WRONG_PIN || "9999";

test.describe("Hive assistant — PIN authorization on confirmations", () => {
  test.beforeEach(async ({ authed, page }) => {
    void authed;
    await page.goto("/hive");
    // Composer input placeholder from src/routes/hive.tsx
    await expect(page.getByPlaceholder(/send .* to /i)).toBeVisible();
  });

  async function askHiveToSend(page: import("@playwright/test").Page) {
    await page.getByPlaceholder(/send .* to /i).fill("Send 1 USD to the first payee");
    // The send button is icon-only; press Enter as the composer supports keyboard submit.
    await page.keyboard.press("Enter");
    // Wait for a Confirm CTA to appear inside a Hive proposal card.
    const confirmBtn = page.getByRole("button", { name: /^Confirm$|Authorize/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
    return confirmBtn;
  }

  test("wrong PIN blocks the Hive-proposed transfer", async ({ page }) => {
    const confirmBtn = await askHiveToSend(page);
    await confirmBtn.click();
    await expect(page.getByRole("dialog", { name: /Authorize via Smart Pay Engine/i })).toBeVisible();
    await typePin(page, WRONG_PIN);
    await expectToast(page, /Incorrect PIN/i);
    await expect(page.getByRole("dialog", { name: /Authorize via Smart Pay Engine/i })).toBeVisible();
  });

  test("correct PIN executes the Hive-proposed transfer", async ({ page }) => {
    const confirmBtn = await askHiveToSend(page);
    await confirmBtn.click();
    await typePin(page, CORRECT_PIN);
    await expect(page.getByRole("dialog", { name: /Authorize via Smart Pay Engine/i })).toBeHidden({
      timeout: 10_000,
    });
  });
});
