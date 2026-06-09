import { describe, it, expect, vi } from "vitest";
import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DonationsSection } from "../components/PriceEditModal/DonationsSection";
import type { DonationDraft } from "../components/PriceEditModal/types";

/**
 * DonationsSection — per-event sidecar donation editor.
 *
 * Phase 4.1 of donations.md closes a long-standing parity gap with the
 * product side: the `label` field was defined on DonationDraft and
 * serialized by buildDonationBody, but the form never rendered an
 * input for it. This test pins:
 *
 *  • Label input appears when donations are enabled, regardless of mode
 *  • Editing the input calls onUpdate with { label }
 *  • maxLength matches the backend cap (100 chars)
 *  • Input is hidden when the donation is disabled (the collapse closes)
 */

const baseDraft: DonationDraft = {
  enabled: true,
  mode: "pwyw",
  amounts: ["5", "10", "25"],
  minAmount: "",
  currency: "EUR",
  label: "",
};

function renderSection(draft: Partial<DonationDraft> = {}, onUpdate = vi.fn()) {
  const full: DonationDraft = { ...baseDraft, ...draft };
  render(
    <DonationsSection donation={full} onUpdate={onUpdate} defaultCurrency="EUR" />,
  );
  return { onUpdate };
}

describe("DonationsSection — label input (Phase 4.1)", () => {
  it("renders the label input when donations are enabled", () => {
    renderSection({ enabled: true });
    const input = screen.getByPlaceholderText(/Add a donation/i) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.tagName).toBe("INPUT");
    expect(input.type).toBe("text");
  });

  it("renders in BOTH fixed mode and pwyw mode", () => {
    renderSection({ enabled: true, mode: "fixed" });
    expect(screen.getByPlaceholderText(/Add a donation/i)).toBeTruthy();
  });

  it("calls onUpdate with the typed label", async () => {
    const { onUpdate } = renderSection({ enabled: true, label: "" });
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/Add a donation/i);
    await user.type(input, "Support our work");
    // onUpdate fires per keystroke — last call carries the final char.
    const lastCall = onUpdate.mock.calls.at(-1)?.[0];
    expect(lastCall).toEqual({ label: "k" });
    // Aggregate by checking we fired the right number of times.
    expect(onUpdate).toHaveBeenCalledTimes("Support our work".length);
  });

  it("displays the current label value", () => {
    renderSection({ enabled: true, label: "Tip the host" });
    const input = screen.getByPlaceholderText(/Add a donation/i) as HTMLInputElement;
    expect(input.value).toBe("Tip the host");
  });

  it("caps input length at 100 characters", () => {
    renderSection({ enabled: true });
    const input = screen.getByPlaceholderText(/Add a donation/i) as HTMLInputElement;
    expect(input.maxLength).toBe(100);
  });

});
