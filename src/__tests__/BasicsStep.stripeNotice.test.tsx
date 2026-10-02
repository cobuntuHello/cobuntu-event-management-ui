import { beforeEach, describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BasicsStep } from "../components/PriceEditModal/steps/BasicsStep";
import { __resetStripeStatusCache } from "../components/stripe-status";
import { renderWithConfig, mockFetch } from "./test-utils";
import type { DraftTier } from "../components/PriceEditModal/types";

/**
 * The payment-account notice beside the price field.
 *
 * ── What it is for ────────────────────────────────────────────────────────
 *
 * The server refuses to create a community-owned PAID event when the
 * community has no connected Stripe account, because the seller share of a
 * community-owned sale is paid out to that account (PayoutService resolves
 * the destination through `communities.stripe_accounts` and throws without
 * one). The rule is right. What was wrong is that a host met it for the first
 * time as a failed save: a community leader hit it five times in eight
 * minutes and wrote in asking why creating an event was broken.
 *
 * ── Why these cases, specifically ─────────────────────────────────────────
 *
 * The same notice was REMOVED from this codebase three times before, and the
 * reasons are recorded in EventForm.noStripeGate.test.tsx. Each one is a case
 * here, because re-introducing any of them is the real risk in this change:
 *
 *   - it must not BLOCK (the old version replaced the editor with a modal)
 *   - it must not speak on an UNPROVEN status (403 read as "not connected")
 *   - it must not fire on a FREE tier, which never needs an account
 */

const BASE: DraftTier = {
  localId: "t1",
  name: "General",
  description: "",
  price: "0",
  currency: "EUR",
  capacity: "40",
  isRecurring: false,
  recurringInterval: "monthly",
  priceMode: "fixed",
  pwywMin: "",
  installmentEnabled: false,
  installmentTotal: "",
  installmentCount: "",
  installmentInterval: "",
  autoScheduleEnabled: false,
  salesStartAt: null,
  salesEndAt: null,
  draftForm: null,
  draftMemberPricing: null,
} as unknown as DraftTier;

function renderStep(over: Partial<DraftTier> = {}, props: Record<string, unknown> = {}) {
  return renderWithConfig(
    <BasicsStep
      t={{ ...BASE, ...over } as DraftTier}
      onUpdate={vi.fn()}
      communityTag="c-1"
      draftMode
      {...props}
    />,
  );
}

const NOTICE = /No payment account connected yet/i;

describe("the payment-account notice", () => {
  beforeEach(() => __resetStripeStatusCache());

  it("appears on a paid tier when the server says no account is connected", async () => {
    mockFetch([
      { url: /\/stripe\/connected/, body: { connected: false, chargesEnabled: false } },
    ]);
    renderStep({ price: "20" });

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    // The link has to point at the CONNECT flow, not the status endpoint. The
    // removed gate's second fault was offering a link that could not clear
    // the condition it described.
    expect(screen.getByRole("link", { name: /Connect Stripe/i }))
      .toHaveAttribute("href", "/c-1/connect-stripe");
  });

  it("leaves the price field fully editable while it is showing", async () => {
    // The point of the whole rewrite: it informs, it does not gate.
    mockFetch([
      { url: /\/stripe\/connected/, body: { connected: false, chargesEnabled: false } },
    ]);
    const onUpdate = vi.fn();
    renderStep({ price: "20" }, { onUpdate });
    await screen.findByText(NOTICE);

    const price = screen.getByDisplayValue("20") as HTMLInputElement;
    expect(price).toBeEnabled();
    await userEvent.type(price, "5");
    expect(onUpdate).toHaveBeenCalled();
  });

  it("says nothing when the status request 403s", async () => {
    /*
     * `/stripe/connected` is gated on ACCESS_ADMIN_APP and the hook maps every
     * failure to `connected: false`. Reading that as a payments fact told
     * ordinary hosts their community had no account whether or not it had
     * one — and it is the one of the three faults that produces a FALSE
     * statement rather than merely an early one.
     */
    mockFetch([{ url: /\/stripe\/connected/, status: 403, body: { error: "forbidden" } }]);
    renderStep({ price: "20" });

    // Settle the effect before asserting absence, so this cannot pass by
    // checking before the response lands.
    await waitFor(() => expect(screen.getByDisplayValue("20")).toBeInTheDocument());
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("says nothing when the status request fails outright", async () => {
    mockFetch([]);
    renderStep({ price: "20" });

    await waitFor(() => expect(screen.getByDisplayValue("20")).toBeInTheDocument());
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("says nothing when an account IS connected", async () => {
    mockFetch([
      { url: /\/stripe\/connected/, body: { connected: true, chargesEnabled: true } },
    ]);
    renderStep({ price: "20" });

    await waitFor(() => expect(screen.getByDisplayValue("20")).toBeInTheDocument());
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("does not even ASK about the account for a free tier", async () => {
    /*
     * A free tier needs no account, so the notice is moot — but the request
     * matters too. It is permission-gated, so firing it for a tier that can
     * never need it puts 403s in the log for a host doing nothing wrong.
     */
    const fetchMock = mockFetch([
      { url: /\/stripe\/connected/, body: { connected: false, chargesEnabled: false } },
    ]);
    renderStep({ price: "0" });

    await waitFor(() => expect(screen.getByDisplayValue("0")).toBeInTheDocument());
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/stripe/connected")),
    ).toHaveLength(0);
  });

  it("says nothing when no communityTag is supplied", async () => {
    // The prop is optional so the notice is opt-in; a caller that omits it
    // must render the step exactly as it did before this change.
    mockFetch([]);
    renderWithConfig(
      <BasicsStep t={{ ...BASE, price: "20" } as DraftTier} onUpdate={vi.fn()} draftMode />,
    );

    await waitFor(() => expect(screen.getByDisplayValue("20")).toBeInTheDocument());
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
