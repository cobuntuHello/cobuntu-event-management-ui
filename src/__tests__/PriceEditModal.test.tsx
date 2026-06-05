import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceEditModal } from "../components/PriceEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const event = { id: "evt-1", name: "Test Event" };
const baseProps = (overrides: any = {}) => ({
  event,
  communityTag: "c-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

const makeTier = (overrides: any = {}) => ({
  id: "tier-1",
  name: "GA",
  description: null,
  capacity: null,
  salesCount: 0,
  priceMode: "fixed",
  pwywMinAmount: null,
  products: { id: "prod-1", price: 1000, currency: "EUR" },
  ...overrides,
});

/**
 * The component does a `/tiers` GET on mount, then probes each tier's
 * form via `/tiers/:id/form`, and finally hits the Stripe `/connected`
 * endpoint via useStripeStatus. We mock all three.
 */
function stubGetRoutes(tiers: any[]) {
  return [
    { method: "GET", url: /\/api\/communities\/c-1\/events\/evt-1\/tiers$/, body: tiers },
    ...tiers.map((t) => ({
      method: "GET" as const,
      url: new RegExp(`/api/communities/c-1/tiers/${t.id}/form$`),
      status: 404,
      body: {},
    })),
    {
      method: "GET" as const,
      url: /\/api\/communities\/c-1\/stripe\/connected$/,
      body: { connected: true, chargesEnabled: true },
    },
  ];
}

describe("PriceEditModal — notify-attendees prompt", () => {
  it("fires the prompt when an existing tier's name changes (the regression we're guarding)", async () => {
    const user = userEvent.setup();
    const tier = makeTier();
    const fetchMock = mockFetch([
      ...stubGetRoutes([tier]),
      { method: "PUT", url: /\/tiers\/tier-1$/, body: tier, bodyFn: (init) => ({ ...tier, ...JSON.parse((init?.body as string) || "{}") }) },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1: tier row shows the name as static text. Click the row → enter L2.
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    // L2: tier name input lives at the top of the hub.
    const nameInput = (await screen.findByPlaceholderText(
      "Standard, VIP, Early-bird…",
    )) as HTMLInputElement;
    expect(nameInput.value).toBe("GA");

    // Change name
    await user.clear(nameInput);
    await user.type(nameInput, "VIP");

    // Save → prompt appears
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText(/update ticket pricing\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /yes, notify attendees/i })).toBeInTheDocument();

    // Choose "Yes, notify attendees" → PUT body includes notifyAttendees: true
    await user.click(screen.getByRole("button", { name: /yes, notify attendees/i }));

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter((c: any) => (c[1]?.method || "GET") === "PUT");
      expect(putCalls).toHaveLength(1);
      expect(JSON.parse(putCalls[0][1]?.body as string)).toMatchObject({ notifyAttendees: true });
    });
  });

  it("fires the prompt when price changes; 'do not notify' omits the flag", async () => {
    const user = userEvent.setup();
    const tier = makeTier();
    const fetchMock = mockFetch([
      ...stubGetRoutes([tier]),
      { method: "PUT", url: /\/tiers\/tier-1$/, body: tier },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // New UX: L1 → click tier row → L2 → click Basics card → L3.
    // SectionCards are now fully clickable buttons with the section
    // heading as accessible name.
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    await user.click(await screen.findByRole("button", { name: /Basics/ }));

    const priceInput = await screen.findByPlaceholderText("0.00") as HTMLInputElement;
    await user.clear(priceInput);
    await user.type(priceInput, "20");

    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText(/update ticket pricing\?/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /yes, do not notify attendees/i }));

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter((c: any) => (c[1]?.method || "GET") === "PUT");
      expect(putCalls).toHaveLength(1);
      const body = JSON.parse(putCalls[0][1]?.body as string);
      expect(body).not.toHaveProperty("notifyAttendees");
    });
  });

  it("does NOT fire the prompt when only non-material fields change (capacity)", async () => {
    const user = userEvent.setup();
    const tier = makeTier();
    const fetchMock = mockFetch([
      ...stubGetRoutes([tier]),
      { method: "PUT", url: /\/tiers\/tier-1$/, body: tier },
    ]);
    const props = baseProps();
    renderWithConfig(<PriceEditModal {...props} />);

    // L1 → click row → L2 → click Options card → L3.
    // Capacity lives in OptionsStep.
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    await user.click(await screen.findByRole("button", { name: /Options/ }));

    const capInput = await screen.findByPlaceholderText("Unlimited") as HTMLInputElement;
    await user.type(capInput, "50");

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    // No prompt — save goes straight through
    expect(screen.queryByText(/update ticket pricing\?/i)).not.toBeInTheDocument();

    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    const putBody = JSON.parse(fetchMock.mock.calls.find((c: any) => c[1]?.method === "PUT")![1]!.body as string);
    expect(putBody).not.toHaveProperty("notifyAttendees");
  });
});

describe("PriceEditModal — capacity lock", () => {
  it("locks price/currency inputs when salesCount > 0", async () => {
    const tier = makeTier({ salesCount: 3 });
    mockFetch(stubGetRoutes([tier]));
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    const user = userEvent.setup();
    // L1 → click tier row → L2 → click Basics card → L3 where price lives.
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    await user.click(await screen.findByRole("button", { name: /Basics/ }));

    const priceInput = await screen.findByPlaceholderText("0.00");
    expect(priceInput).toBeDisabled();
  });

  it("shows the 'X tickets sold — price and currency are locked' banner", async () => {
    const user = userEvent.setup();
    mockFetch(stubGetRoutes([makeTier({ salesCount: 7 })]));
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // Lock banner now lives at the per-tier hub (L2) — click the
    // tier row to enter it.
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    expect(await screen.findByText(/7 tickets sold/i)).toBeInTheDocument();
  });

  // Delete + Duplicate are detail-view actions now: the L1 rows carry NO
  // inline Remove/Duplicate buttons (clean tap-to-open targets). Those
  // actions live on the L2 (per-tier hub) footer instead.
  it("L1 rows have no inline Remove/Duplicate buttons", async () => {
    const lockedTier = makeTier({ id: "tier-locked", name: "Locked", salesCount: 4 });
    const freeTier = makeTier({ id: "tier-free", name: "Free" });
    mockFetch(stubGetRoutes([lockedTier, freeTier]));
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await screen.findByRole("button", { name: /Locked/ });
    expect(screen.getByRole("button", { name: /Free/ })).toBeInTheDocument();

    expect(screen.queryAllByRole("button", { name: /Remove tier/i })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /Duplicate tier/i })).toHaveLength(0);
  });

  // The locked-tier delete protection moved with the Delete button to the
  // L2 footer: entering a locked tier's detail shows a DISABLED Delete
  // (backend rejects the DELETE with 409 until refunds happen first).
  it("disables the L2 footer Delete for locked tiers (salesCount > 0)", async () => {
    const user = userEvent.setup();
    const lockedTier = makeTier({ id: "tier-locked", name: "Locked", salesCount: 4 });
    const freeTier = makeTier({ id: "tier-free", name: "Free" });
    mockFetch(stubGetRoutes([lockedTier, freeTier]));
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // Open the locked tier's detail (L2).
    await user.click(await screen.findByRole("button", { name: /Locked/ }));

    const deleteBtn = await screen.findByRole("button", { name: "Delete" });
    expect(deleteBtn).toBeDisabled();
  });
});

describe("PriceEditModal — save flow correctness", () => {
  // Regression: save() used to call onSaved() inline, which the parent
  // typically reacts to by unmounting the modal. Then setSaving(false)
  // in the finally block + the success toast that follows landed on a
  // dead component. The toast in particular was queued from the modal
  // subtree — once the subtree was gone, the toast host never rendered
  // it. We now show the toast first AND defer onSaved() to after the
  // local finally so the unmount happens with state already torn down.
  it("fires showToast BEFORE onSaved on successful save", async () => {
    const user = userEvent.setup();
    const tier = makeTier();
    mockFetch([
      ...stubGetRoutes([tier]),
      { method: "PUT", url: /\/tiers\/tier-1$/, body: tier },
    ]);
    const events: string[] = [];
    const props = baseProps({
      showToast: (msg: string) => events.push(`toast:${msg}`),
      onSaved: () => events.push("onSaved"),
    });
    renderWithConfig(<PriceEditModal {...props} />);

    // Touch the tier in a non-material way so the prompt doesn't fire
    // (we want the simple save path).
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    await user.click(await screen.findByRole("button", { name: /Options/ }));
    const capInput = await screen.findByPlaceholderText("Unlimited") as HTMLInputElement;
    await user.type(capInput, "50");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(events).toContain("onSaved"));
    const toastIdx = events.findIndex((e) => e.startsWith("toast:"));
    const savedIdx = events.indexOf("onSaved");
    expect(toastIdx).toBeGreaterThanOrEqual(0);
    expect(savedIdx).toBeGreaterThanOrEqual(0);
    expect(toastIdx).toBeLessThan(savedIdx);
    expect(events[toastIdx]).toBe("toast:Pricing updated");
  });

  // Regression: per-tier member-pricing fetches are async (one GET per
  // saved tier). Clicking Save before they resolve used to iterate an
  // empty map and silently drop the host's intended overrides. We now
  // disable Save until every saved tier's slot is either loaded or has
  // errored (errored slots are skipped by the save loop anyway).
  it("disables Save while member-pricing fetches are in flight", async () => {
    const tier = makeTier();
    // Hang the member-pricing GET forever so the loading state pins.
    let resolveMP: ((res: Response) => void) | null = null;
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      if (/\/api\/communities\/c-1\/events\/evt-1\/tiers$/.test(url) && method === "GET") {
        return new Response(JSON.stringify([tier]), { status: 200 });
      }
      if (/\/api\/communities\/c-1\/tiers\/tier-1\/form$/.test(url)) {
        return new Response("{}", { status: 404 });
      }
      if (/\/api\/communities\/c-1\/stripe\/connected$/.test(url)) {
        return new Response(JSON.stringify({ connected: true, chargesEnabled: true }), { status: 200 });
      }
      if (/\/api\/communities\/c-1\/segments$/.test(url)) {
        return new Response(JSON.stringify([{ id: "seg-1", name: "VIPs" }]), { status: 200 });
      }
      if (/\/tiers\/tier-1\/member-pricing$/.test(url) && method === "GET") {
        // Pin in flight — Save must stay disabled until this resolves.
        return new Promise<Response>((r) => { resolveMP = r; });
      }
      throw new Error(`Unmocked: ${method} ${url}`);
    });
    global.fetch = fetchFn as unknown as typeof fetch;

    renderWithConfig(
      <PriceEditModal {...baseProps({ showMemberPricing: true })} />,
    );

    // Wait for the tier row to render — proves the initial /tiers GET
    // resolved and segments were fetched, triggering the hanging
    // member-pricing GET.
    await screen.findByRole("button", { name: /GA/ });

    // Save button should be disabled while the member-pricing fetch is
    // pending.
    await waitFor(() => {
      const saveBtn = screen.getByRole("button", { name: /^save$/i });
      expect(saveBtn).toBeDisabled();
    });

    // Resolve the fetch → Save becomes enabled.
    resolveMP!(new Response(JSON.stringify([]), { status: 200 }));
    await waitFor(() => {
      const saveBtn = screen.getByRole("button", { name: /^save$/i });
      expect(saveBtn).not.toBeDisabled();
    });
  });
});

describe("PriceEditModal — per-tier publish toggle (L2 footer)", () => {
  it("publishing a draft tier PUTs publishedAt as an ISO timestamp (no Save)", async () => {
    const user = userEvent.setup();
    const tier = makeTier({ publishedAt: null });
    const fetchMock = mockFetch([
      ...stubGetRoutes([tier]),
      { method: "PUT", url: /\/tiers\/tier-1$/, body: tier },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await user.click(await screen.findByRole("button", { name: /GA/ }));
    const toggle = await screen.findByRole("switch", { name: "Published" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        (c: any) => /\/tiers\/tier-1$/.test(String(c[0])) && c[1]?.method === "PUT",
      );
      expect(put).toBeTruthy();
      const body = JSON.parse(put![1]!.body as string);
      expect(typeof body.publishedAt).toBe("string");
    });
  });

  it("unpublishing a published tier PUTs publishedAt: null", async () => {
    const user = userEvent.setup();
    const tier = makeTier({ publishedAt: new Date().toISOString() });
    const fetchMock = mockFetch([
      ...stubGetRoutes([tier]),
      { method: "PUT", url: /\/tiers\/tier-1$/, body: tier },
    ]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await user.click(await screen.findByRole("button", { name: /GA/ }));
    const toggle = await screen.findByRole("switch", { name: "Published" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        (c: any) => /\/tiers\/tier-1$/.test(String(c[0])) && c[1]?.method === "PUT",
      );
      expect(put).toBeTruthy();
      const body = JSON.parse(put![1]!.body as string);
      expect(body.publishedAt).toBeNull();
    });
  });
});
