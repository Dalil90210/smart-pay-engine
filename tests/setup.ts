import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

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
}
