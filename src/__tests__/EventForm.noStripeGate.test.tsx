import { beforeEach, describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventForm } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";
import { __resetStripeStatusCache } from "../components/stripe-status";

/**
 * REGRESSION GUARD: configuring a ticket price must never be gated on a
 * payment account.
 *
 * EventForm used to refuse to OPEN the tier editor at all when the community
 * had no connected Stripe account — the most obstructive form of a mistake
 * that also existed in both PriceEditModals. A host could not so much as look
 * at tiers they had already configured, let alone correct a price.
 *
 * Three separate faults, all pinned here:
 *
 *   1. WRONG MOMENT. Setting a price is not when money moves. The account
 *      matters when the event becomes BUYABLE, and the server enforces that
 *      at listing time, where the applicable commission rate is known.
 *
 *   2. WRONG ACCOUNT, UNFIXABLE. The gate read the COMMUNITY's account while
 *      the warning it raised links to the current USER's payouts onboarding,
 *      so following the offered fix could never clear the block.
 *
 *   3. USUALLY NOT EVEN TRUE. `/stripe/connected` is gated on
 *      ACCESS_ADMIN_APP and useStripeStatus maps ANY error to not-ready, so a
 *      non-admin host's 403 was indistinguishable from a community that had
 *      genuinely never connected. Most hosts who saw the warning were being
 *      told something false.
 *
 * Every case below therefore uses a community that is NOT connected — the
 * exact state the old gate blocked on. The rest of the suite mocks
 * `{connected: true, chargesEnabled: true}`, which is why it never caught this.
 *
 * ── What this guard does NOT forbid ────────────────────────────────────────
 *
 * It forbids BLOCKING, not mentioning. A later change added a non-blocking
 * notice beside the price field (StripePayoutNotice), because the server does
 * refuse to CREATE a community-owned paid event without an account to pay out
 * to, and a host used to meet that rule for the first time as a failed save.
 *
 * These cases originally asserted that the words "Connect Stripe" never
 * appear at all, which is a broader claim than the one the file is defending
 * and would have forbidden any explanation whatsoever. They now assert what
 * actually matters: the editor opens, and every pricing control in it works.
 * Fault 3 is unchanged and still absolute — on an UNPROVEN status, nothing is
 * claimed at all. See StripePayoutNotice.known.
 */

const PAID_TIER = {
  localId: "t1",
  name: "General",
  description: "",
  price: "20",
  currency: "EUR",
  capacity: "40",
  isRecurring: false,
  recurringInterval: "monthly" as const,
  priceMode: "fixed" as const,
  pwywMin: "",
  installmentEnabled: false,
  installmentTotal: "",
  installmentCount: "",
  installmentInterval: "",
  autoScheduleEnabled: false,
  salesStartAt: "",
  salesEndAt: "",
  publishedAt: new Date().toISOString(),
};

function renderForm(tiers: unknown[]) {
  return renderWithConfig(
    <EventForm communityTag="c-1" onChange={vi.fn()} initialData={{ tiers } as any} />,
  );
}

describe("EventForm — no Stripe gate on configuring prices", () => {
  /*
   * `stripeCache` is module-level and keyed only by communityTag, so without
   * this the 403 and network-failure cases below get the FIRST case's answer
   * back from cache and never test their own mock at all.
   */
  beforeEach(() => __resetStripeStatusCache());

  it("opens the tier editor for a PAID tier when the community has NO Stripe", async () => {
    // The exact state the old gate refused on: a paid tier, no connected
    // account. The editor must open anyway.
    mockFetch([
      { url: /\/stripe\/connected/, body: { connected: false, chargesEnabled: false } },
    ]);
    const user = userEvent.setup();
    renderForm([PAID_TIER]);

    await user.click(screen.getByRole("button", { name: /General/ }));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    /*
     * The price field is EDITABLE, which is the whole claim. The notice beside
     * it is expected here (the server gave a real answer), but it must not
     * take the control away — the old gate replaced this field with a modal.
     */
    // By value, not by label: the "Price" eyebrow is a styled <p>, not a
    // <label>, so getByLabelText finds the text and no control under it.
    const price = screen.getByDisplayValue("20") as HTMLInputElement;
    expect(price).toBeEnabled();
    expect(price.type).toBe("number");
    expect(screen.getByText(/No payment account connected yet/i)).toBeInTheDocument();
  });

  it("opens the editor when the status endpoint 403s (a non-admin host)", async () => {
    // Fault 3, stated as a test. This is the common case in production: an
    // ordinary host reading an admin-only endpoint. It must not be mistaken
    // for "this community cannot take payments".
    mockFetch([{ url: /\/stripe\/connected/, status: 403, body: { error: "forbidden" } }]);
    const user = userEvent.setup();
    renderForm([PAID_TIER]);

    await user.click(screen.getByRole("button", { name: /General/ }));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    // Fault 3: a permission error is not a payments fact, so NOTHING is said.
    expect(screen.getByDisplayValue("20")).toBeEnabled();
    expect(screen.queryByText(/No payment account connected yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Connect Stripe/i)).not.toBeInTheDocument();
  });

  it("opens the editor when the status request fails outright", async () => {
    // Same invariant under a network failure rather than an HTTP error: an
    // unanswerable question must not resolve to "blocked".
    mockFetch([]);
    const user = userEvent.setup();
    renderForm([PAID_TIER]);

    await user.click(screen.getByRole("button", { name: /General/ }));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByDisplayValue("20")).toBeEnabled();
    expect(screen.queryByText(/No payment account connected yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Connect Stripe/i)).not.toBeInTheDocument();
  });

  it("never renders the Connect Stripe warning on the form itself", async () => {
    mockFetch([
      { url: /\/stripe\/connected/, body: { connected: false, chargesEnabled: false } },
    ]);
    renderForm([PAID_TIER]);

    // Give any status effect time to resolve and re-render before asserting
    // absence, so this cannot pass merely by checking too early.
    await waitFor(() => expect(screen.getByRole("button", { name: /General/ })).toBeInTheDocument());
    expect(screen.queryByText(/Connect Stripe/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/payment account/i)).not.toBeInTheDocument();
  });
});
