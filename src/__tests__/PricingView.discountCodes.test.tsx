import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ManageAccessProvider } from "../lib/manageAccess";
import { PricingView } from "../page/views/PricingView";

/**
 * The Discount codes card on an event's Pricing tab (backend
 * docs/features/discount-codes.md, Phase 3): mounted for hosts with this
 * event's endpoint and tickets, and not at all for a read-only viewer.
 */
vi.mock("@cobuntu/management-ui-shared", async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    DiscountCodesSection: (props: any) => (
      <div data-testid="discount-codes">
        <span data-testid="dc-endpoint">{JSON.stringify({ ...props.endpoint, headers: undefined })}</span>
        <span data-testid="dc-tiers">{JSON.stringify(props.tiers)}</span>
      </div>
    ),
  };
});
vi.mock("../components/PriceEditModal/DonationsSection", () => ({ DonationsSection: () => <div />, DonationsHeading: () => null }));
vi.mock("../components/PriceEditModal", () => ({ PriceEditModal: () => <div /> }));

const event = { id: "evt-1", name: "Success Talks", tiers: [{ id: "t-1", name: "Standard", products: { price: 27500, currency: "EUR" } }] };

function renderView(canEdit: boolean, eventId = "evt-1") {
  renderWithConfig(
    <ManageAccessProvider canEdit={canEdit}>
      <PricingView event={event} communityTag="demo" eventId={eventId} onUpdate={vi.fn()} showToast={vi.fn()} />
    </ManageAccessProvider>,
  );
}

describe("PricingView discount codes", () => {
  it("mounts the card for a host, with this event's endpoint and tickets", () => {
    renderView(true);
    expect(JSON.parse(screen.getByTestId("dc-endpoint").textContent!)).toMatchObject({ communityTag: "demo", item: { kind: "event", id: "evt-1" } });
    expect(JSON.parse(screen.getByTestId("dc-tiers").textContent!)).toEqual([{ id: "t-1", name: "Standard", currency: "EUR" }]);
  });

  it("asks for the event's ID even when the page was opened by its slug", () => {
    // Live, 2026-11-16: the slug reached the routes, which answered 404, and
    // the card hid itself on every event.
    renderView(true, "success-talks");
    expect(JSON.parse(screen.getByTestId("dc-endpoint").textContent!)).toMatchObject({ item: { kind: "event", id: "evt-1" } });
  });

  it("is absent for a read-only viewer", () => {
    renderView(false);
    expect(screen.queryByTestId("discount-codes")).toBeNull();
  });
});
