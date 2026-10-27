import { beforeEach, describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventForm } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";
import { __resetStripeStatusCache } from "../components/stripe-status";

/**
 * Pricing-step presets: "Free entry" / "Paid entry" / "Free with donations".
 *
 * Covers the three things the spec calls out as non-visual logic:
 *   1. Which card shows selected, derived purely from tiers[0].price +
 *      donation.enabled (no separate "active preset" state to drift).
 *   2. The dirty/pristine reset-confirm gate: a preset applies immediately
 *      while nothing would be lost, and goes through DiscardPrompt once the
 *      host has hand-edited tiers/donation.
 *   3. The dismissible tip banner's own dismiss behavior.
 */

const FREE_TIER = {
  localId: "t1", name: "Standard", description: "", price: "0", currency: "EUR",
  capacity: "", isRecurring: false, recurringInterval: "monthly" as const,
  publishedAt: new Date().toISOString(),
};

function renderForm(overrides: { tiers?: unknown[]; donation?: unknown } = {}) {
  return renderWithConfig(
    <EventForm
      communityTag="c-1"
      page="commerce"
      onChange={vi.fn()}
      initialData={{ tiers: overrides.tiers ?? [FREE_TIER], donation: overrides.donation as any } as any}
    />,
  );
}

describe("EventForm — pricing presets", () => {
  beforeEach(() => __resetStripeStatusCache());

  it("selects Free entry when price is 0 and donations are off", async () => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: true, chargesEnabled: true } }]);
    renderForm();
    await waitFor(() => expect(screen.getByRole("button", { name: /Free entry/ })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: /Paid entry/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Free with donations/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("selects Free with donations when price is 0 and donations are enabled", async () => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: true, chargesEnabled: true } }]);
    renderForm({ donation: { enabled: true, mode: "fixed", amounts: ["5"], minAmount: "", currency: "EUR", label: "" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Free with donations/ })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: /Free entry/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("selects Paid entry when price > 0 and donations are off", async () => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: true, chargesEnabled: true } }]);
    renderForm({ tiers: [{ ...FREE_TIER, price: "20" }] });
    await waitFor(() => expect(screen.getByRole("button", { name: /Paid entry/ })).toHaveAttribute("aria-pressed", "true"));
  });

  it("selects Paid entry (closest match) when price > 0 AND donations are enabled", async () => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: true, chargesEnabled: true } }]);
    renderForm({
      tiers: [{ ...FREE_TIER, price: "20" }],
      donation: { enabled: true, mode: "fixed", amounts: ["5"], minAmount: "", currency: "EUR", label: "" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /Paid entry/ })).toHaveAttribute("aria-pressed", "true"));
  });

  it("Paid entry stays clickable (not disabled) until Stripe is connected, and sends the host to Stripe Connect on click", async () => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: false, chargesEnabled: false } }]);
    const user = userEvent.setup();
    renderForm();
    await waitFor(() => expect(screen.getByRole("button", { name: /Paid entry/ })).not.toBeDisabled());
    expect(screen.getByText(/Connect Stripe to accept payments/i)).toBeInTheDocument();

    const hrefSpy = vi.spyOn(window.location, "href", "set");

    await user.click(screen.getByRole("button", { name: /Paid entry/ }));
    expect(hrefSpy).toHaveBeenCalledWith(expect.stringContaining("stripe"));

    hrefSpy.mockRestore();
  });

  it("Free entry click applies immediately when nothing is dirty (no confirm)", async () => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: true, chargesEnabled: true } }]);
    const user = userEvent.setup();
    renderForm({ tiers: [{ ...FREE_TIER, price: "20" }] });
    await waitFor(() => expect(screen.getByRole("button", { name: /Paid entry/ })).toHaveAttribute("aria-pressed", "true"));

    await user.click(screen.getByRole("button", { name: /Free entry/ }));

    // No dirty edit happened yet, so this applies without a confirm dialog.
    expect(screen.queryByText(/Reset to this preset/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Free entry/ })).toHaveAttribute("aria-pressed", "true"));
  });

  it("shows DiscardPrompt before applying a preset once the host has hand-edited donations", async () => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: true, chargesEnabled: true } }]);
    const user = userEvent.setup();
    renderForm();
    await waitFor(() => expect(screen.getByRole("button", { name: /Free entry/ })).toHaveAttribute("aria-pressed", "true"));

    // Hand-edit donations via the row below the presets — this is the "any
    // path other than a preset click" the spec calls out, so it must dirty.
    const donationToggle = screen.getByRole("switch", { name: /donation/i });
    await user.click(donationToggle);

    await user.click(screen.getByRole("button", { name: /Paid entry/ }));

    expect(await screen.findByText(/Reset to this preset/i)).toBeInTheDocument();
    // Cancel leaves the manual edit in place.
    await user.click(screen.getByRole("button", { name: /Keep editing/i }));
    expect(screen.queryByText(/Reset to this preset/i)).not.toBeInTheDocument();
  });
});

describe("EventForm — dismissible pricing-step tip", () => {
  beforeEach(() => __resetStripeStatusCache());

  it("renders the Good to know tip and dismisses it on click", async () => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: true, chargesEnabled: true } }]);
    const user = userEvent.setup();
    renderForm();

    expect(await screen.findByText(/Good to know/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Dismiss/i }));
    // Dismissal now plays a short close animation before unmounting (see
    // DismissibleTipBanner / TIP_CLOSE_MS), so the text disappears
    // asynchronously rather than on the same tick as the click.
    await waitFor(() => expect(screen.queryByText(/Good to know/i)).not.toBeInTheDocument());
  });
});
