import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { EventForm, type TierItem } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";
import { memberPricingSummary, ticketTakesMemberPricing } from "../components/memberPricesRow";

/**
 * The "Member prices" row on the event create wizard's tickets step.
 *
 * Member pricing was reachable while creating an event only at the bottom of
 * each ticket's editor, below its price and billing setup; sellers did not
 * find it (2026-11-10). The row puts it on the step, says what is set, and
 * opens the ticket's editor at that section.
 */

const SEGMENTS = [
  { id: "seg-community", name: "Community" },
  { id: "seg-member", name: "Member" },
];

const ticket = (o: Partial<TierItem> = {}): TierItem => ({
  localId: crypto.randomUUID(), name: "Standard", description: "", price: "275", currency: "EUR",
  capacity: "", isRecurring: false, recurringInterval: "monthly", publishedAt: new Date().toISOString(), ...o,
});

function setup(tiers: TierItem[], { segments = SEGMENTS, scope = "seller" as "seller" | "community" } = {}) {
  const fetchSpy = mockFetch([
    { url: /\/stripe\/connected/, body: { connected: true } },
    { url: /\/member-pricing\/segments(\?scope=community)?$/, body: segments },
  ]);
  renderWithConfig(
    <EventForm communityTag="pbn" page="commerce" showMemberPricing memberPricingScope={scope}
      initialData={{ tiers } as any} />,
  );
  return fetchSpy;
}

describe("memberPricesRow helpers (events)", () => {
  it("a ticket that charges takes member pricing; a free one does not", () => {
    expect(ticketTakesMemberPricing({ price: "275" })).toBe(true);
    expect(ticketTakesMemberPricing({ price: "0" })).toBe(false);
    expect(ticketTakesMemberPricing({ price: "" })).toBe(true); // "Price needed" after Paid entry
    expect(ticketTakesMemberPricing({ price: "0", priceMode: "pwyw" })).toBe(true);
  });

  it("summarises each override against the tier's name", () => {
    expect(memberPricingSummary({
      currency: "EUR",
      draftMemberPricing: [
        { segmentId: "seg-community", mode: "FIXED_PRICE", value: 6500 },
        { segmentId: "seg-member", mode: "FLAT_OFF", value: 1000 },
      ],
    }, SEGMENTS)).toBe("Community €65.00 · Member €10.00 off");
    expect(memberPricingSummary({ currency: "EUR", draftMemberPricing: [] }, SEGMENTS)).toBeNull();
  });
});

describe("EventForm — Member prices row", () => {
  it("shows for a paid ticket, from the seller's tier list", async () => {
    const fetchSpy = setup([ticket()]);
    expect(await screen.findByText("Add member prices")).toBeInTheDocument();
    expect(fetchSpy.mock.calls.map((c) => String(c[0])).some((u) => u.endsWith("/api/communities/pbn/member-pricing/segments"))).toBe(true);
  });

  it("summarises what is already set", async () => {
    setup([ticket({ draftMemberPricing: [{ segmentId: "seg-community", mode: "FIXED_PRICE", value: 6500 }] })]);
    expect(await screen.findByText("Community €65.00")).toBeInTheDocument();
    expect(screen.getByText("Member prices")).toBeInTheDocument();
  });

  it("one row per paid ticket when there are several", async () => {
    setup([ticket(), ticket({ name: "VIP", price: "400" })]);
    expect(await screen.findByText("Member prices · Standard")).toBeInTheDocument();
    expect(screen.getByText("Member prices · VIP")).toBeInTheDocument();
  });

  it("hidden for a free event", async () => {
    const fetchSpy = setup([ticket({ price: "0" })]);
    await waitFor(() => expect(fetchSpy.mock.calls.some((c) => /segments$/.test(String(c[0])))).toBe(true));
    expect(screen.queryByText("Add member prices")).not.toBeInTheDocument();
  });

  it("hidden when the community has no tier to price for", async () => {
    const fetchSpy = setup([ticket()], { segments: [] });
    await waitFor(() => expect(fetchSpy.mock.calls.some((c) => /segments$/.test(String(c[0])))).toBe(true));
    expect(screen.queryByText("Add member prices")).not.toBeInTheDocument();
  });

  it("a leader's community-owned event reads every tier with scope=community, not the leaders' admin list", async () => {
    const fetchSpy = setup([ticket()], { scope: "community" });
    await screen.findByText("Add member prices");
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith("/api/communities/pbn/member-pricing/segments?scope=community"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/api/communities/pbn/segments"))).toBe(false);
  });
});
