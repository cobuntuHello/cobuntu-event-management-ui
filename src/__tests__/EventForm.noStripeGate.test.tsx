import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventForm } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";

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
    expect(screen.queryByText(/Connect Stripe/i)).not.toBeInTheDocument();
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
