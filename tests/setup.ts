import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// Suppress "not wrapped in act(...)" noise emitted by input-otp's internal
// state management. These warnings are false positives: the controlled
// state that matters to our tests is already guarded by waitFor/userEvent.
const INPUT_OTP_ACT_PATTERN = /not wrapped in act/i;
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (INPUT_OTP_ACT_PATTERN.test(msg)) return;
    console.error(...args);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

// Radix UI + input-otp need these in jsdom
if (typeof window !== "undefined") {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error - jsdom missing
  window.ResizeObserver ||= RO;
  // @ts-expect-error - jsdom missing
  globalThis.ResizeObserver ||= RO;
  // @ts-expect-error - jsdom missing
  window.HTMLElement.prototype.hasPointerCapture ||= () => false;
  // @ts-expect-error - jsdom missing
  window.HTMLElement.prototype.releasePointerCapture ||= () => {};
  // @ts-expect-error - jsdom missing
  window.HTMLElement.prototype.scrollIntoView ||= () => {};
  // @ts-expect-error - jsdom missing
  document.elementFromPoint ||= () => null;
}
