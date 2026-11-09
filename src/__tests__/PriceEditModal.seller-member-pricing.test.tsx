import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { PriceEditModal } from "../components/PriceEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * memberPricingScope="seller" (2026-11-09): a host's own event priced for the
 * members of the community it is submitted to.
 *
 *   1. Tiers come from GET /member-pricing/segments (the community's public
 *      tiers), never from the leaders' GET /segments, which 403s a member.
 *   2. The default ("community") still reads the leaders' list.
 *
 * Same fixtures as PriceEditModal.member-pricing-roundtrip.test.tsx. The save
 * toast for sentForReview mirrors the products package, where it is pinned.
 */

const event = { id: "evt-1", name: "Success Talks Porto" };
const tier = {
  id: "tier-1",
  name: "Guest",
  description: null,
  capacity: null,
  salesCount: 0,
  priceMode: "fixed",
  pwywMinAmount: null,
  products: { id: "prod-1", price: 27500, currency: "EUR" },
};

const props = (overrides: any = {}) => ({
  event,
  communityTag: "pbn",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  showMemberPricing: true,
  ...overrides,
});

function routes() {
  return [
    { method: "GET", url: /\/api\/communities\/pbn\/events\/evt-1\/tiers$/, body: [tier] },
    { method: "GET", url: /\/api\/communities\/pbn\/tiers\/tier-1\/form$/, status: 404, body: {} },
    { method: "GET", url: /\/api\/communities\/pbn\/stripe\/connected$/, body: { connected: true, chargesEnabled: true } },
    { method: "GET", url: /\/api\/communities\/pbn\/member-pricing\/segments$/, body: [{ id: "seg-1", name: "Community" }] },
    { method: "GET", url: /\/api\/communities\/pbn\/segments$/, body: [{ id: "seg-1", name: "Community" }] },
    { method: "GET", url: /\/api\/communities\/pbn\/tiers\/tier-1\/member-pricing$/, body: [] },
  ];
}

const calledUrls = (fetchFn: any) => fetchFn.mock.calls.map(([url]: any) => url.toString());

describe("PriceEditModal (event): seller member pricing", () => {
  it("seller scope loads the community's public tiers, not the leaders' list", async () => {
    const fetchFn = mockFetch(routes());
    renderWithConfig(<PriceEditModal {...props({ memberPricingScope: "seller" })} />);
    await waitFor(() => {
      expect(calledUrls(fetchFn).some((u: string) => /\/pbn\/member-pricing\/segments$/.test(u))).toBe(true);
    });
    expect(calledUrls(fetchFn).some((u: string) => /\/pbn\/segments$/.test(u))).toBe(false);
    expect(await screen.findByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it("community scope (the default) still reads the leaders' list", async () => {
    const fetchFn = mockFetch(routes());
    renderWithConfig(<PriceEditModal {...props()} />);
    await waitFor(() => {
      expect(calledUrls(fetchFn).some((u: string) => /\/pbn\/segments$/.test(u))).toBe(true);
    });
    expect(calledUrls(fetchFn).some((u: string) => /\/member-pricing\/segments$/.test(u))).toBe(false);
  });
});
