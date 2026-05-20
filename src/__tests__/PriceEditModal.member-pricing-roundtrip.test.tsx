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
    await screen.findByDisplayValue("GA");

    // 2. Expand the tier card — exposes the EditHub (4 SectionCards).
    await user.click(screen.getAllByLabelText(/expand|collapse/i)[0]);

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

    // 5. Click Done — returns to the hub. Pre-fix: MembersStep would
    //    unmount here and lose the dirty rows. Post-fix: it stays
    //    mounted under the hidden class.
    await user.click(screen.getByRole("button", { name: /Done/i }));

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

    await screen.findByDisplayValue("GA");
    await user.click(screen.getAllByLabelText(/expand|collapse/i)[0]);
    const editButtons = await screen.findAllByRole("button", { name: /^Edit/ });
    await user.click(editButtons[2]);

    // Toggle VIPs on
    const vipsCheckbox = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    await user.click(vipsCheckbox);
    expect(vipsCheckbox).toBeChecked();

    // Exit + re-enter
    await user.click(screen.getByRole("button", { name: /Done/i }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /^Edit/ }).length,
      ).toBeGreaterThanOrEqual(4),
    );
    await user.click(
      screen.getAllByRole("button", { name: /^Edit/ })[2],
    );

    // The same checkbox is still checked — local state survived.
    // Pre-fix: instance unmounted + re-mounted with a fresh fetch,
    // and the box would be unchecked again.
    const vipsAfter = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    expect(vipsAfter).toBeChecked();
  });

  it("collapsing the tier card mid-edit no longer drops the dirty rows (papercut #1 fix)", async () => {
    // The original PriceEditModal redesign had a known papercut: state
    // lived inside MemberPricingSection, so collapsing the tier card
    // (which unmounted EditHub + everything below) dropped any
    // pending dirty rows. Post-state-lift, the rows live in
    // PriceEditModal's state map and survive collapse cycles.
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
    await screen.findByDisplayValue("GA");

    // Expand → enter Members step → make a dirty row
    await user.click(screen.getAllByLabelText(/expand|collapse/i)[0]);
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

    // Return to hub, then COLLAPSE the tier card — this used to wipe
    // the dirty rows. The state map at PriceEditModal level keeps
    // them now.
    await user.click(screen.getByRole("button", { name: /Done/i }));
    await user.click(screen.getAllByLabelText(/expand|collapse/i)[0]);

    // Click Save without re-expanding the card. The dirty member-
    // pricing row should still commit because the modal-level state
    // map persists across the collapse.
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
