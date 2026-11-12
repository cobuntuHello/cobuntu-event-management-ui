import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { EventForm, type TierItem } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * The event create wizard's "Member prices" step (memberPricesStep +
 * page="members").
 *
 * Member pricing at create time lived in each ticket's editor, then as a row
 * under the tickets; sellers missed both (Pathseekers, 2026-11-12), and the
 * row also hid itself when the tier list did not load or nothing was priced.
 * The step is always there and says why when there is nothing to set.
 */

const SEGMENTS = [
  { id: "seg-community", name: "Community" },
  { id: "seg-member", name: "Member" },
];

const ticket = (o: Partial<TierItem> = {}): TierItem => ({
  localId: crypto.randomUUID(), name: "Standard", description: "", price: "275", currency: "EUR",
  capacity: "", isRecurring: false, recurringInterval: "monthly", publishedAt: new Date().toISOString(), ...o,
});

function setup(
  tiers: TierItem[],
  { segments = SEGMENTS as unknown, scope = "seller" as "seller" | "community", status = 200, page = "members" as "members" | "commerce" } = {},
) {
  const fetchSpy = mockFetch([
    { url: /\/stripe\/connected/, body: { connected: true } },
    { url: /\/member-pricing\/segments(\?scope=community)?$/, status, body: segments },
  ]);
  const onChange = vi.fn();
  renderWithConfig(
    <EventForm communityTag="pbn" page={page} showMemberPricing memberPricesStep memberPricingScope={scope}
      onChange={onChange} initialData={{ tiers } as any} />,
  );
  const last = () => onChange.mock.calls.at(-1)?.[0];
  return { fetchSpy, last };
}

describe("EventForm: the Member prices step", () => {
  it("lists each paid ticket with the community's tiers, from the seller's tier list", async () => {
    const { fetchSpy } = setup([ticket(), ticket({ name: "VIP", price: "400" })]);
    expect(await screen.findAllByLabelText("Offer Community a member price")).toHaveLength(2);
    expect(screen.getByText("€275.00")).toBeInTheDocument();
    expect(screen.getByText("€400.00")).toBeInTheDocument();
    // A host's own event: the one line the page heading does not already say.
    expect(screen.getByText("The community approves your member prices along with your listing.")).toBeInTheDocument();
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith("/api/communities/pbn/member-pricing/segments"))).toBe(true);
  });

  it("a leader's community-owned event reads every tier with scope=community", async () => {
    const { fetchSpy } = setup([ticket()], { scope: "community" });
    await screen.findByLabelText("Offer Community a member price");
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith("/api/communities/pbn/member-pricing/segments?scope=community"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/api/communities/pbn/segments"))).toBe(false);
    // A community's own event gets no second line under the heading.
    expect(screen.queryByText(/approves your member prices/)).not.toBeInTheDocument();
  });

  it("a ticked tier starts at % off, and typing an amount puts it on the ticket the create payload carries", async () => {
    const { last } = setup([ticket()]);
    fireEvent.click(await screen.findByLabelText("Offer Member a member price"));
    fireEvent.change(screen.getByLabelText("Member price for Member"), { target: { value: "25" } });
    await waitFor(() => {
      expect(last()?.tiers?.[0]?.draftMemberPricing).toEqual([
        { segmentId: "seg-member", mode: "PERCENT_OFF", value: 25, priority: 0 },
      ]);
    });
    expect(last()?.memberPricingError).toBeNull();
  });

  it("shows a saved fixed price in the currency, and unticking removes it", async () => {
    const { last } = setup([ticket({ draftMemberPricing: [{ segmentId: "seg-community", mode: "FIXED_PRICE", value: 6500, priority: 0 }] })]);
    const amount = await screen.findByLabelText("Member price for Community");
    expect((amount as HTMLInputElement).value).toBe("65");
    fireEvent.click(screen.getByLabelText("Offer Community a member price"));
    await waitFor(() => expect(last()?.tiers?.[0]?.draftMemberPricing).toBeNull());
  });

  it("an invalid amount holds the wizard and keeps the last valid prices on the ticket", async () => {
    const { last } = setup([ticket()]);
    fireEvent.click(await screen.findByLabelText("Offer Community a member price"));
    fireEvent.change(screen.getByLabelText("Member price for Community"), { target: { value: "150" } });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await waitFor(() => expect(last()?.memberPricingError).toMatch(/^Community: the discount must be/));
    expect(last()?.tiers?.[0]?.draftMemberPricing ?? null).toBeNull();
  });

  it("says plainly when the community has published no tiers", async () => {
    setup([ticket()], { segments: [] });
    expect(await screen.findByText(/hasn't published any membership tiers yet/)).toBeInTheDocument();
  });

  it("says plainly when every ticket is free", async () => {
    setup([ticket({ price: "0" })]);
    expect(await screen.findByText(/Every ticket is free/)).toBeInTheDocument();
  });

  it("offers to try again when the tier list does not load", async () => {
    const { fetchSpy } = setup([ticket()], { status: 500, segments: {} });
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(fetchSpy.mock.calls.filter((c) => /member-pricing\/segments/.test(String(c[0]))).length).toBe(2);
    });
  });

  it("with the step on, the tickets step's 'Member prices' row steps aside", async () => {
    const { fetchSpy } = setup([ticket()], { page: "commerce" });
    await waitFor(() => expect(fetchSpy.mock.calls.some((c) => /member-pricing\/segments/.test(String(c[0])))).toBe(true));
    expect(screen.queryByText("Add member prices")).not.toBeInTheDocument();
  });

  it("drops member prices from a ticket that no longer charges", async () => {
    const { last } = setup([ticket({ price: "0", draftMemberPricing: [{ segmentId: "seg-member", mode: "PERCENT_OFF", value: 20, priority: 0 }] })]);
    await waitFor(() => expect(last()).toBeTruthy());
    expect(last()?.tiers?.[0]?.draftMemberPricing ?? null).toBeNull();
  });
});
