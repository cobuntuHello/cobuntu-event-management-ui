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

    // L1: tier row shows the name as static text. Click the row → L2 hub.
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    // L2 hub → open the Details tile (name + capacity live there now).
    await user.click(await screen.findByRole("button", { name: /Details/ }));
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
    await user.click(await screen.findByRole("button", { name: /Pricing configuration/ }));

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

    // L1 → click row → L2 hub → open Details (name + capacity live there).
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    await user.click(await screen.findByRole("button", { name: /Details/ }));

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
    await user.click(await screen.findByRole("button", { name: /Pricing configuration/ }));

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

  // Delete is ALWAYS visible + enabled now (no hidden/disabled features
  // without explanation). When it can't proceed it explains via a toast.
  it("locked tier: clicking Delete shows a refund-first toast, doesn't delete", async () => {
    const user = userEvent.setup();
    const toasts: string[] = [];
    const lockedTier = makeTier({ id: "tier-locked", name: "Locked", salesCount: 4 });
    const freeTier = makeTier({ id: "tier-free", name: "Free" });
    const fetchMock = mockFetch(stubGetRoutes([lockedTier, freeTier]));
    renderWithConfig(<PriceEditModal {...baseProps({ showToast: (m: string) => toasts.push(m) })} />);

    await user.click(await screen.findByRole("button", { name: /Locked/ }));
    const deleteBtn = await screen.findByRole("button", { name: "Delete" });
    expect(deleteBtn).toBeEnabled();
    await user.click(deleteBtn);

    expect(toasts.some((t) => /refund/i.test(t))).toBe(true);
    expect(fetchMock.mock.calls.some((c: any) => c[1]?.method === "DELETE")).toBe(false);
  });

  it("only tier: clicking Delete shows 'needs at least one tier' toast", async () => {
    const user = userEvent.setup();
    const toasts: string[] = [];
    const tier = makeTier();
    mockFetch(stubGetRoutes([tier]));
    renderWithConfig(<PriceEditModal {...baseProps({ showToast: (m: string) => toasts.push(m) })} />);

    await user.click(await screen.findByRole("button", { name: /GA/ }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(toasts.some((t) => /at least one tier/i.test(t))).toBe(true);
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
    await user.click(await screen.findByRole("button", { name: /Details/ }));
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

describe("PriceEditModal — header breadcrumb + single title/subtitle", () => {
  it("L1 has no breadcrumb; L2 shows the tier crumb + name; L3 shows step crumb trail + step title", async () => {
    const user = userEvent.setup();
    const tier = makeTier({ name: "GA" });
    mockFetch([...stubGetRoutes([tier])]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    // L1 — single list title, no breadcrumb nav.
    expect(await screen.findByRole("heading", { name: "Edit pricing", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();

    // L2 — breadcrumb back to the list, title = tier name.
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    const nav2 = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav2).getByRole("button", { name: "Pricing tiers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "GA", level: 3 })).toBeInTheDocument();

    // L3 (Config step) — crumb trail [Pricing tiers › GA], title "Config".
    await user.click(await screen.findByRole("button", { name: /Config/ }));
    const nav3 = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav3).getByRole("button", { name: "Pricing tiers" })).toBeInTheDocument();
    expect(within(nav3).getByRole("button", { name: "GA" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Config", level: 3 })).toBeInTheDocument();
    // The auto-schedule control now lives in the Config step.
    expect(screen.getByRole("switch", { name: "Auto-schedule sales window" })).toBeInTheDocument();
  });

  it("clicking the tier-name crumb pops L3 → L2; clicking the list crumb pops back to L1", async () => {
    const user = userEvent.setup();
    const tier = makeTier({ name: "GA" });
    mockFetch([...stubGetRoutes([tier])]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await user.click(await screen.findByRole("button", { name: /GA/ }));
    await user.click(await screen.findByRole("button", { name: /Config/ }));

    // Crumb "GA" → back to the hub (Config tile visible again).
    const nav3 = await screen.findByRole("navigation", { name: "Breadcrumb" });
    await user.click(within(nav3).getByRole("button", { name: "GA" }));
    expect(await screen.findByRole("heading", { name: "Config", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "GA", level: 3 })).toBeInTheDocument();

    // Crumb "Pricing tiers" → back to L1 list (no breadcrumb).
    const nav2 = await screen.findByRole("navigation", { name: "Breadcrumb" });
    await user.click(within(nav2).getByRole("button", { name: "Pricing tiers" }));
    expect(await screen.findByRole("heading", { name: "Edit pricing", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
  });

  it("Description input lives in the Details step, not Pricing configuration", async () => {
    const user = userEvent.setup();
    const tier = makeTier({ name: "GA" });
    mockFetch([...stubGetRoutes([tier])]);
    renderWithConfig(<PriceEditModal {...baseProps()} />);

    await user.click(await screen.findByRole("button", { name: /GA/ }));

    // Details → Description field present.
    await user.click(await screen.findByRole("button", { name: /Details/ }));
    expect(await screen.findByPlaceholderText("What's included")).toBeInTheDocument();

    // Back to hub → Pricing configuration → no Description field there.
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    await user.click(await screen.findByRole("button", { name: /Pricing configuration/ }));
    expect(screen.queryByPlaceholderText("What's included")).not.toBeInTheDocument();
  });
});
