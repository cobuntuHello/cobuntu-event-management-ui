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
    expect(tierRowNames()).toEqual([]);

    // The parent was never told about a tier either — rows and the submitted
    // payload read the same state, so both have to stay clean.
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

    expect(tierRowNames()).toEqual([]);
  });

  it("saving the tier modal adds exactly one tier", async () => {
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" />);

    await openTierModal(user);
    const dialog = screen.getByRole("dialog");
    await priceTheOpenTier(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(tierRowNames()).toHaveLength(1);
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

    expect(tierRowNames()).toHaveLength(1);
    expect(tierRowNames()[0]).not.toMatch(/Unnamed tier/);
  });
});
