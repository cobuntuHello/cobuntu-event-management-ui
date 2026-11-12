import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
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
    { method: "GET", url: /\/api\/communities\/c-1\/member-pricing\/segments\?scope=community$/, body: segments },
    {
      method: "GET",
      url: /\/api\/communities\/c-1\/tiers\/tier-1\/member-pricing$/,
      body: [],
    },
  ];
}

    /*
     * No tile click here any more. The PriceEditModal redesign replaced the
     * Level-2 TILE MENU with an inline edit screen (TierEditView): name,
     * description and the whole pricing surface are on the tier screen
     * itself, and only capacity / sales window / registration form drill into
     * an Advanced sub-screen. These clicks navigated a menu that no longer
     * exists, so the tests went red for a deliberate design change while the
     * behaviour they assert was never broken.
     */
describe("PriceEditModal — Member Pricing round-trip", () => {
  it("keeps Save ENABLED when the community has no segments (regression: was permanently disabled)", async () => {
    // Prod bug (same as the product modal): with showMemberPricing + a saved
    // tier + ZERO segments, the per-tier member-pricing fetch effect returns
    // early, so memberPricingByTier never populates → memberPricingPending was
    // stuck true → the footer Save was disabled forever (clicking did nothing,
    // no toast). A no-segment community could not save any event tier.
    mockFetch([
      { method: "GET", url: /\/api\/communities\/c-1\/events\/evt-1\/tiers$/, body: [tier] },
      { method: "GET", url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/, status: 404, body: {} },
      { method: "GET", url: /\/api\/communities\/c-1\/stripe\/connected$/, body: { connected: true, chargesEnabled: true } },
      { method: "GET", url: /\/api\/communities\/c-1\/member-pricing\/segments\?scope=community$/, body: [] }, // NO segments
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);
    const saveBtn = await screen.findByRole("button", { name: /^save$/i });
    await waitFor(() => expect(saveBtn).not.toBeDisabled());
  });

  /*
   * T-304: these three asserted a Members STEP that the inline redesign
   * removed. Member pricing is now rendered inline on the tier screen (L2) by
   * TierEditView, so "exiting the Members step" no longer denotes anything and
   * the old double-Back (L3 -> L2 -> L1) had one hop too many.
   *
   * The GUARANTEE is unchanged and is what these now pin: dirty member-pricing
   * rows live in PriceEditModal's own state map, so they survive navigation and
   * commit on the outer Save. What changed is which transitions can threaten
   * them. Three remain, and there is one test each:
   *
   *   1. leaving the tier screen   L2 -> L1, then Save
   *   2. re-entering the tier      L2 -> L1 -> L2
   *   3. drilling into a step      L2 -> L3 -> L2, then Save
   *
   * (3) replaces the old "leaving the tier mid-edit" case, which collapsed
   * into (1) once member pricing stopped being a step. The remaining drill-ins
   * are the two Advanced rows, so the sales-window step is the live risk now.
   */
  it("dirty rows committed via outer Save after leaving the tier screen", async () => {
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

    // 1. L1 lists the tier as a clickable row (the name is read-only text).
    // 2. Click the row -> the tier screen (L2), where member pricing is inline.
    await user.click(await screen.findByRole("button", { name: /GA/ }));

    // 3. Wait for the section to load and toggle a row dirty.
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

    // 5. One Back, to the tier list (L1), where the outer Save lives. There
    //    is no hub in between any more.
    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    expect(await screen.findByRole("heading", { name: "Edit pricing", level: 3 })).toBeInTheDocument();

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

  it("re-entering the tier shows the previously-toggled state (mount stability)", async () => {
    const user = userEvent.setup();
    mockFetch(stubLoadRoutes());
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1 -> click row -> L2, member pricing inline.
    await user.click(await screen.findByRole("button", { name: /GA/ }));

    // Toggle VIPs on
    const vipsCheckbox = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    await user.click(vipsCheckbox);
    expect(vipsCheckbox).toBeChecked();

    // Leave the tier via footer Back, then walk back into it. This is the
    // transition that used to unmount the section and drop the toggle.
    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    await user.click(await screen.findByRole("button", { name: /GA/ }));

    // The same checkbox is still checked -- modal-level state survived.
    const vipsAfter = await screen.findByLabelText(
      /Offer member pricing for VIPs/,
    );
    expect(vipsAfter).toBeChecked();
  });

  it("drilling into a step and back mid-edit no longer drops the dirty rows", async () => {
    // The remaining drill-in. Entering the sales-window step swaps the tier
    // screen out of the tree, which is the same shape of unmount that used to
    // lose pending rows -- so the guarantee is re-pinned at the one boundary
    // where it can still fail. Rows live in PriceEditModal's state map, not in
    // the section, so they survive L2 <-> L3.
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

    // L1 -> click row -> L2 -> toggle a row dirty.
    await user.click(await screen.findByRole("button", { name: /GA/ }));

    await user.click(
      await screen.findByLabelText(/Offer member pricing for VIPs/),
    );
    const valueInput = (screen
      .getAllByPlaceholderText(/20|10|—/)
      .find((el) => (el as HTMLInputElement).type === "number") as HTMLInputElement);
    fireEvent.change(valueInput, { target: { value: "20" } });
    expect(await screen.findByText(/unsaved/i)).toBeInTheDocument();

    // Into the sales-window step and back out to the tier screen, then out to
    // L1 where Save lives.
    await user.click(screen.getByRole("button", { name: /sales window/i }));
    expect(await screen.findByRole("heading", { name: "Sales window", level: 3 })).toBeInTheDocument();
    const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
    await user.click(within(nav).getByRole("button", { name: "GA" }));
    await user.click(screen.getByRole("button", { name: /^Back$/ }));

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

/**
 * Member amounts are before VAT, like every price, so a saved amount comes back
 * exactly as stored and a VAT change does not touch the row.
 */
describe("PriceEditModal — member prices on a ticket with VAT", () => {
  const vatTier = {
    ...tier,
    products: { id: "prod-1", price: 3000, currency: "EUR", vatCategory: "STANDARD", vatPriceEntry: "ADDED" },
  };
  const routes = () => [
    { method: "GET", url: /\/api\/communities\/c-1\/events\/evt-1\/tiers$/, body: [vatTier] },
    {
      method: "GET",
      url: /\/events\/evt-1\/vat-options$/,
      body: {
        available: true, reason: null, reasonText: null,
        jurisdiction: { key: "PT", name: "Portugal", label: "IVA" },
        options: [{ category: "STANDARD", rate: 23 }, { category: "REDUCED", rate: 6 }],
      },
    },
    { method: "GET", url: /\/api\/communities\/c-1\/tiers\/tier-1\/form$/, status: 404, body: {} },
    { method: "GET", url: /\/api\/communities\/c-1\/stripe\/connected$/, body: { connected: true, chargesEnabled: true } },
    { method: "GET", url: /\/api\/communities\/c-1\/member-pricing\/segments\?scope=community$/, body: segments },
    {
      method: "GET",
      url: /\/api\/communities\/c-1\/tiers\/tier-1\/member-pricing$/,
      body: [{ id: "ov-1", segmentId: "seg-1", mode: "FIXED_PRICE", value: 2000, priority: 0 }],
    },
    { method: "PUT", url: /\/tiers\/tier-1$/, body: vatTier },
    { method: "POST", url: /\/api\/communities\/c-1\/tiers\/tier-1\/member-pricing$/, body: { id: "ov-1" } },
  ];
  const memberPosts = (fetchFn: ReturnType<typeof mockFetch>) =>
    fetchFn.mock.calls.filter(
      ([url, init]: any) => /\/tiers\/tier-1\/member-pricing$/.test(url.toString()) && init?.method === "POST",
    );
  const tierPut = (fetchFn: ReturnType<typeof mockFetch>) =>
    fetchFn.mock.calls.find(([url, init]: any) => /\/tiers\/tier-1$/.test(url.toString()) && init?.method === "PUT");

  it("shows the ticket and the member amount as stored, and what the member pays at checkout", async () => {
    const user = userEvent.setup();
    mockFetch(routes());
    renderWithConfig(<PriceEditModal {...baseProps()} />);
    await user.click(await screen.findByRole("button", { name: /GA/ }));

    expect(await screen.findByText("Before VAT")).toBeInTheDocument();
    const preview = await screen.findByTestId("member-vat-preview");
    expect(preview.textContent).toContain("24.60");
  });

  it("changing the rate sends the same EUR30 and leaves the member row alone", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(routes());
    renderWithConfig(<PriceEditModal {...baseProps()} />);
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    await screen.findByTestId("member-vat-preview");

    await user.click(screen.getByRole("radio", { name: /6%/ }));
    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    await user.click(await screen.findByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(tierPut(fetchFn)).toBeTruthy());
    const body = JSON.parse((tierPut(fetchFn)![1] as RequestInit).body as string);
    expect(body).toMatchObject({ price: 30, vatCategory: "REDUCED", vatPriceEntry: "ADDED" });
    expect(memberPosts(fetchFn)).toHaveLength(0);
  });
});
