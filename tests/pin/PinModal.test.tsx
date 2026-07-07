import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PinModal } from "@/components/PinModal";

vi.mock("@/lib/ledger", () => ({
  verifyPin: vi.fn(),
  hasPin: vi.fn(),
}));

import { verifyPin, hasPin } from "@/lib/ledger";

async function typePin(user: ReturnType<typeof userEvent.setup>, pin: string) {
  // Focus the OTP input group; input-otp renders a hidden input that receives keystrokes.
  const input = document.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
  expect(input).toBeTruthy();
  input.focus();
  await user.keyboard(pin);
}

describe.each([
  { flow: "Send money", title: "Authorize transfer" },
  { flow: "Convert currency", title: "Authorize conversion" },
  { flow: "Hive confirmation", title: "Authorize via Smart Pay Engine" },
])("PinModal — $flow", ({ title }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    (hasPin as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it("calls onSuccess when the correct PIN is entered", async () => {
    (verifyPin as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<PinModal open onOpenChange={onOpenChange} onSuccess={onSuccess} title={title} />);

    await waitFor(() => expect(hasPin).toHaveBeenCalled());
    await typePin(user, "1234");

    await waitFor(() => expect(verifyPin).toHaveBeenCalledWith("1234"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error and does not call onSuccess when the PIN is incorrect", async () => {
    (verifyPin as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<PinModal open onOpenChange={onOpenChange} onSuccess={onSuccess} title={title} />);

    await waitFor(() => expect(hasPin).toHaveBeenCalled());
    await typePin(user, "9999");

    await waitFor(() => expect(verifyPin).toHaveBeenCalledWith("9999"));
    expect(onSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Incorrect PIN")).toBeInTheDocument());
    expect(screen.getByText("That PIN didn't match. Please try again.")).toBeInTheDocument();
    // Modal stays open so the user can retry.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("shows no-pin guidance and blocks verification when no PIN is set", async () => {
    (hasPin as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();

    render(<PinModal open onOpenChange={onOpenChange} onSuccess={onSuccess} title={title} />);

    await waitFor(() => expect(screen.getByText("No PIN set")).toBeInTheDocument());
    expect(
      screen.getByText(
        "You need a 4-digit PIN before you can authorize transactions. Set one in Settings, then try again.",
      ),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(verifyPin).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("surfaces backend errors from verifyPin without calling onSuccess", async () => {
    (verifyPin as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<PinModal open onOpenChange={onOpenChange} onSuccess={onSuccess} title={title} />);

    await waitFor(() => expect(hasPin).toHaveBeenCalled());
    await typePin(user, "1111");

    await waitFor(() => expect(screen.getByText("Network problem")).toBeInTheDocument());
    expect(
      screen.getByText("We couldn't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("PinModal wiring in money-moving screens", () => {
  it("Send, Convert, and Hive screens render PinModal for authorization", async () => {
    const fs = await import("node:fs/promises");
    const files = await Promise.all([
      fs.readFile("src/routes/send.tsx", "utf8"),
      fs.readFile("src/routes/convert.tsx", "utf8"),
      fs.readFile("src/routes/hive.tsx", "utf8"),
      fs.readFile("src/routes/assistant.$threadId.tsx", "utf8"),
    ]);
    for (const src of files) {
      expect(src).toMatch(/PinModal/);
      expect(src).toMatch(/onSuccess=/);
    }
  });
});
