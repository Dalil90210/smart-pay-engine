import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// Radix UI needs these in jsdom
if (typeof window !== "undefined") {
  // @ts-expect-error - jsdom missing
  window.HTMLElement.prototype.hasPointerCapture ||= () => false;
  // @ts-expect-error - jsdom missing
  window.HTMLElement.prototype.releasePointerCapture ||= () => {};
  // @ts-expect-error - jsdom missing
  window.HTMLElement.prototype.scrollIntoView ||= () => {};
}
