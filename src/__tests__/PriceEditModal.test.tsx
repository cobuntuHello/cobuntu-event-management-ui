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

    // New UX: L1 → click tier row → L2 → click Basics Edit → L3.
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);

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

    // L1 → click row → L2 → click Options Edit → L3.
    // Capacity lives in OptionsStep. Edit button order in L2:
    // Basics / Options / [Members] / Form. showMemberPricing is off
    // in baseProps so no Members card.
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    const editButtons = screen.getAllByRole("button", { name: /^Edit/ });
    await user.click(editButtons[1]);

    const capInput = await screen.findByPlaceholderText("∞") as HTMLInputElement;
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
    // L1 → click tier row → L2 → click Basics Edit → L3 where price lives.
    await user.click(await screen.findByRole("button", { name: /GA/ }));
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);

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
});
