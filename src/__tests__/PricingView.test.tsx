import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { ManageAccessProvider } from "../lib/manageAccess";
import { PricingView } from "../page/views/PricingView";

/**
 * The Pricing tab: the create wizard's tier list, on the manage page.
 *
 * What these pin, and why each one is here rather than left to review:
 *
 *  1. Money. Tier prices arrive in the SMALLEST UNIT. The first version of
 *     this view read `t.products.price` raw, which renders 2500 as "2500.00"
 *     instead of "25.00" -- a hundredfold error on the one number a seller
 *     looks at. Nothing about the markup looks wrong when that happens.
 *
 *  2. The drill-in contract. Clicking a card must open the editor on THAT
 *     tier, not on the modal's own list. It works because saved tiers reuse
 *     their backend id as `localId`, which is an invariant of
 *     PriceEditModal's loader, not a property of this view -- so it is worth
 *     a test that fails if that loader changes.
 *
 *  3. The read-only gate. A leader of a community that merely CARRIES someone
 *     else's event must not be able to reprice it. The sibling guard
 *     (manageAccess.every-view-is-gated) only proves this file CALLS
 *     useCanEdit; it cannot prove the call changes anything. This does.
 */

// The modal is a large component with its own fetches. Here we only care
// about WHICH tier it was asked to open, so it is replaced by a probe that
// renders the props under test.
vi.mock("../components/PriceEditModal", () => ({
  PriceEditModal: (props: any) => (
    <div data-testid="price-modal">
      <span data-testid="open-tier">{String(props.openTierLocalId ?? "")}</span>
      <span data-testid="open-new">{String(!!props.openNewTier)}</span>
      <span data-testid="member-pricing">{String(!!props.showMemberPricing)}</span>
    </div>
  ),
}));

const EUR = { price: 2500, currency: "EUR" };

function makeEvent(over: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    communityId: "comm-1",
    tiers: [
      {
        id: "tier-a",
        name: "Early bird",
        capacity: 50,
        publishedAt: "2026-10-01T00:00:00.000Z",
        products: EUR,
        tier_forms: [{ id: "f1" }],
      },
      {
        id: "tier-b",
        name: "Door",
        capacity: null,
        publishedAt: null,
        products: { price: 0, currency: "EUR" },
      },
    ],
    ...over,
  };
}

function renderView(
  { canEdit = true, event = makeEvent() }: { canEdit?: boolean; event?: any } = {},
) {
  const onUpdate = vi.fn();
  const showToast = vi.fn();
  renderWithConfig(
    <ManageAccessProvider canEdit={canEdit}>
      <PricingView
        event={event}
        communityTag="demo"
        eventId="evt-1"
        onUpdate={onUpdate}
        showToast={showToast}
      />
    </ManageAccessProvider>,
  );
  return { onUpdate, showToast };
}

beforeEach(() => vi.clearAllMocks());

describe("PricingView", () => {
  it("renders a card per tier", () => {
    renderView();
    expect(screen.getByText("Early bird")).toBeTruthy();
    expect(screen.getByText("Door")).toBeTruthy();
  });

  it("converts the price out of the smallest unit", () => {
    renderView();
    // 2500 minor units is 25.00, not 2500.00.
    expect(screen.getByText("€25.00")).toBeTruthy();
    expect(screen.queryByText("€2500.00")).toBeNull();
  });

  it("shows a zero price as Free rather than 0.00", () => {
    renderView();
    expect(screen.getByText("Free")).toBeTruthy();
  });

  it("surfaces capacity, form and status as facts", () => {
    renderView();
    expect(screen.getByText("50 spots")).toBeTruthy();
    expect(screen.getByText("Unlimited")).toBeTruthy(); // capacity: null
    expect(screen.getByText("Linked")).toBeTruthy();    // tier_forms present
    expect(screen.getByText("Not set")).toBeTruthy();   // no form on tier-b
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();     // publishedAt: null
  });

  it("opens the editor on the clicked tier, not the modal's list", () => {
    renderView();
    expect(screen.queryByTestId("price-modal")).toBeNull();
    fireEvent.click(screen.getByText("Door"));
    expect(screen.getByTestId("open-tier").textContent).toBe("tier-b");
    expect(screen.getByTestId("open-new").textContent).toBe("false");
  });

  it("asks for a brand new tier via openNewTier, with no target id", () => {
    renderView();
    fireEvent.click(screen.getByText("Add ticket type"));
    expect(screen.getByTestId("open-new").textContent).toBe("true");
    expect(screen.getByTestId("open-tier").textContent).toBe("");
  });

  describe("read-only viewer", () => {
    it("still sees the tiers", () => {
      renderView({ canEdit: false });
      expect(screen.getByText("Early bird")).toBeTruthy();
    });

    it("cannot open a tier", () => {
      renderView({ canEdit: false });
      fireEvent.click(screen.getByText("Early bird"));
      expect(screen.queryByTestId("price-modal")).toBeNull();
    });

    it("is not offered the Add affordance", () => {
      renderView({ canEdit: false });
      expect(screen.queryByText("Add ticket type")).toBeNull();
    });
  });

  describe("member pricing", () => {
    it("is enabled for a community-owned event", () => {
      renderView();
      fireEvent.click(screen.getByText("Door"));
      expect(screen.getByTestId("member-pricing").textContent).toBe("true");
    });

    it("is withheld on a personally-owned event", () => {
      // Segments are community-scoped; MemberPricingService refuses the write
      // on a personal event, so offering the editor would be a dead end.
      renderView({ event: makeEvent({ communityId: null }) });
      fireEvent.click(screen.getByText("Door"));
      expect(screen.getByTestId("member-pricing").textContent).toBe("false");
    });
  });

  it("tolerates an event with no tiers", () => {
    renderView({ event: makeEvent({ tiers: undefined }) });
    expect(screen.getByText("Add ticket type")).toBeTruthy();
  });
});
