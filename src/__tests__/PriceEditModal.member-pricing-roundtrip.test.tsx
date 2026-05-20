import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceEditModal } from "../components/PriceEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * The bug that motivated this test:
 *
 * Slice 5's EditHub rendered the Members step's MemberPricingSection
 * in a different React subtree depending on `activeStep`. Hub view
 * mounted instance A (hidden); step view mounted instance B (visible).
 * Clicking "Done" in the Members step unmounted instance B and
 * remounted instance A from scratch — discarding any pending dirty
 * row changes AND removing the instance from the outer modal's ref
 * map. The outer modal's Save loop then iterated an empty map and
 * silently skipped the member-pricing commit. The user thought they
 * had saved; nothing was saved.
 *
 * Slice 7 keeps MembersStep mounted across hub↔step transitions.
 * This test pins the end-to-end contract: enter Members → edit a row
 * → click Done → click outer Save → assert the upsert POST fired
 * with the dirty payload.
 */

const event = { id: "evt-1", name: "Test Event" };
const tier = {
  id: "tier-1",
  name: "GA",
  description: null,
  capacity: null,
  salesCount: 0,
  priceMode: "fixed",
  pwywMinAmount: null,
  products: { id: "prod-1", price: 1000, currency: "EUR" },
};
const segments = [
  { id: "seg-1", name: "VIPs" },
  { id: "seg-2", name: "Students" },
];

const baseProps = (overrides: any = {}) => ({
  event,
  communityTag: "c-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  showMemberPricing: true,
  ...overrides,
});

function stubLoadRoutes() {
  return [
    { method: "GET", url: /\/api\/communities\/c-1\/events\/evt-1\/tiers$/, body: [tier] },
    { method: "GET", url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/, status: 404, body: {} },
    {
      method: "GET",
      url: /\/api\/communities\/c-1\/stripe\/connected$/,
      body: { connected: true, chargesEnabled: true },
    },
    { method: "GET", url: /\/api\/communities\/c-1\/segments$/, body: segments },
    {
      method: "GET",
      url: /\/api\/communities\/c-1\/tiers\/tier-1\/member-pricing$/,
      body: [],
    },
  ];
}

describe("PriceEditModal — Member Pricing round-trip", () => {
  it("dirty rows committed via outer Save after exiting the Members step (bug #1)", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch([
      ...stubLoadRoutes(),
      // The PUT that commits the unchanged tier (capacity/desc are
      // sent even when nothing changed).
      { method: "PUT", url: /\/tiers\/tier-1$/, body: tier },
      // The POST that commits the member-pricing override.
      {
        method: "POST",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/member-pricing$/,
        body: { id: "ov-new" },
      },
    ]);

    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // 1. Wait for the modal to load with the GA tier collapsed.
    // L1 lists tier as a clickable row (name is read-only text).
    // 2. Click the row → enter L2 (per-tier hub takeover).
    await user.click(await screen.findByRole("button", { name: /GA/ }));

    // 3. Click "Edit" on the Member pricing card. Buttons in
    //    order: Basics / Options / Member pricing / Registration form.
    const editButtons = await screen.findAllByRole("button", { name: /^Edit/ });
    await user.click(editButtons[2]);

    // 4. Wait for the section to load and toggle a row dirty.
    const vipsCheckbox = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    await user.click(vipsCheckbox);

    // Set a percent-off value
    const valueInput = (screen
      .getAllByPlaceholderText(/20|10|—/)
      .find((el) => (el as HTMLInputElement).type === "number") as HTMLInputElement);
    fireEvent.change(valueInput, { target: { value: "20" } });

    // The "unsaved" badge appears inline — proves the section reads
    // dirty before any commit.
    expect(await screen.findByText(/unsaved/i)).toBeInTheDocument();

    // 5. Back to hub (L2). Step navigation uses the back-arrow row.
    await user.click(screen.getByRole("button", { name: /Back to/ }));

    // Hub is visible again (4 section cards re-show as the row of
    // Edit buttons).
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /^Edit/ }).length,
      ).toBeGreaterThanOrEqual(4),
    );

    // 6. Click the outer modal's Save. Should commit BOTH the tier
    //    update (PUT) AND the member-pricing override (POST).
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    // 7. Assert the member-pricing POST fired with the dirty row.
    await waitFor(() => {
      const post = fetchFn.mock.calls.find(
        ([url, init]: any) =>
          /\/tiers\/tier-1\/member-pricing$/.test(url.toString()) &&
          (init?.method || "GET") === "POST",
      );
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body).toMatchObject({
        segmentId: "seg-1",
        mode: "PERCENT_OFF",
        value: 20,
      });
    });
  });

  it("re-entering Members step shows the previously-toggled state (mount stability)", async () => {
    const user = userEvent.setup();
    mockFetch(stubLoadRoutes());
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1 → click row → L2 → Edit on Members → L3.
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    const editButtons = await screen.findAllByRole("button", { name: /^Edit/ });
    await user.click(editButtons[2]);

    // Toggle VIPs on
    const vipsCheckbox = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    await user.click(vipsCheckbox);
    expect(vipsCheckbox).toBeChecked();

    // Exit step (Back-to-hub arrow), then re-enter via the Members
    // SectionCard's Edit button.
    await user.click(screen.getByRole("button", { name: /Back to/ }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /^Edit/ }).length,
      ).toBeGreaterThanOrEqual(4),
    );
    await user.click(
      screen.getAllByRole("button", { name: /^Edit/ })[2],
    );

    // The same checkbox is still checked — modal-level state survived.
    const vipsAfter = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    expect(vipsAfter).toBeChecked();
  });

  it("leaving the tier (back to tiers) mid-edit no longer drops the dirty rows (papercut #1 fix)", async () => {
    // Pre-state-lift: rows lived inside MemberPricingSection. Leaving
    // the tier (back-arrow up to L1) unmounted the section + dropped
    // any pending dirty rows. Post-lift: rows live in PriceEditModal's
    // state map and survive Level 1 ↔ Level 2 navigation.
    const user = userEvent.setup();
    const fetchFn = mockFetch([
      ...stubLoadRoutes(),
      { method: "PUT", url: /\/tiers\/tier-1$/, body: tier },
      {
        method: "POST",
        url: /\/api\/communities\/c-1\/tiers\/tier-1\/member-pricing$/,
        body: { id: "ov-new" },
      },
    ]);

    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1 → click row → L2 → Edit on Members → L3 → toggle → dirty.
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    const editButtons = await screen.findAllByRole("button", { name: /^Edit/ });
    await user.click(editButtons[2]);

    await user.click(
      await screen.findByLabelText(/Offer member pricing for VIPs/),
    );
    const valueInput = (screen
      .getAllByPlaceholderText(/20|10|—/)
      .find((el) => (el as HTMLInputElement).type === "number") as HTMLInputElement);
    fireEvent.change(valueInput, { target: { value: "20" } });
    expect(await screen.findByText(/unsaved/i)).toBeInTheDocument();

    // Back to hub (L2), then back to tiers (L1). Pre-fix, leaving the
    // tier wiped the dirty rows. Modal-level state map keeps them now.
    await user.click(screen.getByRole("button", { name: /Back to GA/ }));
    await user.click(screen.getByRole("button", { name: /Back to tiers/ }));

    // Click Save from L1 — the dirty member-pricing row should commit.
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const post = fetchFn.mock.calls.find(
        ([url, init]: any) =>
          /\/tiers\/tier-1\/member-pricing$/.test(url.toString()) &&
          (init?.method || "GET") === "POST",
      );
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body).toMatchObject({
        segmentId: "seg-1",
        mode: "PERCENT_OFF",
        value: 20,
      });
    });
  });
});
