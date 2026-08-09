import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventForm } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * Adding a ticket tier — the create/cancel lifecycle.
 *
 * Reported 2026-08-09 against the products form and shared by this one:
 * addAndEditTier appended a blank tier to the form's state and THEN opened the
 * modal. The modal's direct-open footer button is Cancel and only calls
 * onClose(), so nothing rolled the append back and every cancelled attempt
 * left a row behind. Here the blank tier had `name: ""`, so the leftovers read
 * "Unnamed tier".
 *
 * The fix makes handleTiersCommit the only writer of the tiers array. These
 * tests pin it, because the failure is silent — a stray tier looks like
 * something the host did rather than a bug.
 *
 * Baseline is ONE row, not zero: the form seeds a "Standard" tier the same way
 * ProductForm does, so "leaves no tier behind" means the count is unchanged,
 * not that it is empty.
 */

const TIER_ROW = /Unnamed tier|Standard|Tier \d/;

/** Names of the tier rows in the Tickets card. */
function tierRowNames(): string[] {
  return screen
    .queryAllByRole("button")
    .map((b) => b.textContent || "")
    .filter((t) => TIER_ROW.test(t))
    .map((t) => t.trim());
}

async function openTierModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /add ticket tier/i }));
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
}

/**
 * Give the open tier a price. Save validates every draft and rejects a
 * priceless one, so without this the modal never closes and the test would be
 * measuring validation instead of the lifecycle.
 */
async function priceTheOpenTier(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  const price = within(dialog).getAllByRole("spinbutton")[0]!;
  await user.clear(price);
  await user.type(price, "25");
}

describe("EventForm — adding a ticket tier", () => {
  beforeEach(() => {
    // openTierEditor refuses to open the modal unless Stripe is ready, so a
    // connected account is part of the fixture, not incidental.
    // stripeReady needs BOTH flags — connected alone leaves the gate closed
    // and the "Connect Stripe" warning opens instead of the tier modal.
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: true, chargesEnabled: true } }]);
  });

  it("cancelling the tier modal leaves no tier behind", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} />);

    await openTierModal(user);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Just the seeded "Standard" — the cancelled one left nothing behind.
    expect(tierRowNames()).toHaveLength(1);

    // And the untouched seed is not submitted, so the event still creates as a
    // plain free RSVP with no tiers (see submittableTiers in EventForm).
    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.tiers ?? []).toEqual([]);
  });

  it("cancelling three times still leaves no tiers", async () => {
    // The reported symptom exactly: repeated open/close piled up rows.
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" />);

    for (let i = 0; i < 3; i++) {
      await openTierModal(user);
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^cancel$/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }

    expect(tierRowNames()).toHaveLength(1);
  });

  it("saving the tier modal adds exactly one tier", async () => {
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" />);

    await openTierModal(user);
    const dialog = screen.getByRole("dialog");
    await priceTheOpenTier(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Seeded "Standard" + the one just added.
    expect(tierRowNames()).toHaveLength(2);
  });

  it("names an added tier rather than leaving it Unnamed", async () => {
    // The old code passed `name: ""`, so a leftover row read "Unnamed tier"
    // and two of them were indistinguishable.
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" />);

    await openTierModal(user);
    const dialog = screen.getByRole("dialog");
    await priceTheOpenTier(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(tierRowNames()).toHaveLength(2);
    expect(tierRowNames().some((n) => /Unnamed tier/.test(n))).toBe(false);
    expect(tierRowNames().some((n) => /Tier 2/.test(n))).toBe(true);
  });
});

/**
 * The seeded "Standard" tier.
 *
 * This form used to start with no tiers at all: a host creating a free event
 * saw "Free event" and no row, and since capacity and registration forms are
 * BOTH per-tier (event-level capacity was removed in the tier-only refactor),
 * a free event with limited spots or an application form was unreachable.
 * ProductForm has always seeded one; this is that parity.
 *
 * The half that is easy to regress is what gets SUBMITTED. An untouched seed
 * must not create a ticket tier — that would move every wizard-created event
 * off the tier-less RSVP path and start stamping a tierId on attendances.
 */
describe("EventForm — the seeded Standard tier", () => {
  beforeEach(() => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: true, chargesEnabled: true } }]);
  });

  it("shows a Standard row on a fresh form", async () => {
    renderWithConfig(<EventForm communityTag="c-1" />);
    expect(tierRowNames()).toHaveLength(1);
    expect(tierRowNames()[0]).toMatch(/Standard/);
  });

  it("reads as Free, since the seed does not charge", async () => {
    renderWithConfig(<EventForm communityTag="c-1" />);
    expect(tierRowNames()[0]).toMatch(/Free/);
  });

  it("does NOT submit the seed when the host never touches it", async () => {
    // The load-bearing one. A plain free event must still create with zero
    // tiers, exactly as it did before this row existed.
    const onChange = vi.fn();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} />);

    expect(onChange.mock.calls.at(-1)?.[0].tiers).toEqual([]);
  });

  it("submits the seed once it carries a capacity", async () => {
    // A free event with limited spots — the case that had nowhere to live.
    const onChange = vi.fn();
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={onChange}
        initialData={{ tiers: [{ localId: "s", name: "Standard", description: "", price: "0",
          currency: "EUR", capacity: "40", isRecurring: false, recurringInterval: "monthly" }] } as any} />,
    );

    const t = onChange.mock.calls.at(-1)?.[0].tiers;
    expect(t).toHaveLength(1);
    expect(t[0].capacity).toBe("40");
  });

  it("submits the seed once it carries a registration form", async () => {
    const onChange = vi.fn();
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={onChange}
        initialData={{ tiers: [{ localId: "s", name: "Standard", description: "", price: "0",
          currency: "EUR", capacity: "", isRecurring: false, recurringInterval: "monthly",
          draftForm: { fields: [{ id: "q1", label: "Why?", type: "text" }] } }] } as any} />,
    );

    expect(onChange.mock.calls.at(-1)?.[0].tiers).toHaveLength(1);
  });

  it("submits a free tier the host renamed", async () => {
    // Events could already ship a named free tier and that stays true —
    // ProductForm drops one of these, which is a separate bug over there.
    const onChange = vi.fn();
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={onChange}
        initialData={{ tiers: [{ localId: "s", name: "Early bird", description: "", price: "0",
          currency: "EUR", capacity: "", isRecurring: false, recurringInterval: "monthly" }] } as any} />,
    );

    expect(onChange.mock.calls.at(-1)?.[0].tiers).toHaveLength(1);
  });

  it("submits the seed once it charges", async () => {
    const onChange = vi.fn();
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={onChange}
        initialData={{ tiers: [{ localId: "s", name: "Standard", description: "", price: "25",
          currency: "EUR", capacity: "", isRecurring: false, recurringInterval: "monthly" }] } as any} />,
    );

    expect(onChange.mock.calls.at(-1)?.[0].tiers).toHaveLength(1);
  });
});
