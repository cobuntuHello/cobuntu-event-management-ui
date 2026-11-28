/**
 * Event capacity in the Pricing tiers modal (T-422, backend
 * docs/features/event-capacity.md): the places all of an event's tickets
 * share, set under "Whole listing" beside Donations.
 *
 * TEJÁ's Gypsy dinner: "wine included" (26) and "without wine" (10) share 26
 * chairs. Not set, the card says what the tickets add up to (36); set, it
 * shows the places taken and left, the ticket screen says it shares them, and
 * Save writes it through its own endpoint.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceEditModal } from "../components/PriceEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const event = { id: "evt-1", name: "Gypsy dinner" };
const props = (overrides: any = {}) => ({
  event,
  communityTag: "c-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

const tier = (id: string, name: string, capacity: number | null, salesCount = 0) => ({
  id, name, description: null, capacity, salesCount, priceMode: "fixed", pwywMinAmount: null,
  products: { id: `prod-${id}`, price: 6500, currency: "EUR" },
});
const TIERS = [tier("wine", "Dinner, wine included", 26), tier("nowine", "Dinner, without wine", 10)];

function routes(capacity: { eventCapacity: number | null; taken: number } | null, extra: any[] = []) {
  return [
    { method: "GET", url: /\/api\/communities\/c-1\/events\/evt-1\/tiers$/, body: TIERS },
    ...TIERS.map((t) => ({ method: "GET" as const, url: new RegExp(`/api/communities/c-1/tiers/${t.id}/form$`), status: 404, body: {} })),
    { method: "GET" as const, url: /\/api\/communities\/c-1\/stripe\/connected$/, body: { connected: true, chargesEnabled: true } },
    // Save re-sends every saved tier (unchanged ones too) before the sidecars.
    ...TIERS.map((t) => ({ method: "PUT" as const, url: new RegExp(`/events/evt-1/tiers/${t.id}$`), body: t })),
    capacity
      ? { method: "GET" as const, url: /\/events\/evt-1\/capacity$/, body: { ...capacity, ticketsTotal: 36 } }
      : { method: "GET" as const, url: /\/events\/evt-1\/capacity$/, status: 500, body: {} },
    ...extra,
  ];
}

const capacityPuts = (fetchMock: any) =>
  fetchMock.mock.calls.filter((c: any) => c[1]?.method === "PUT" && /\/capacity$/.test(String(c[0])));

describe("PriceEditModal: event capacity", () => {
  it("not set: says what the tickets add up to", async () => {
    mockFetch(routes({ eventCapacity: null, taken: 14 }));
    renderWithConfig(<PriceEditModal {...props()} />);
    expect(await screen.findByText("Event capacity (optional)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Not set")).toHaveValue("");
    expect(screen.getByText(/what its tickets add up to: 36 places \(26 \+ 10\)/)).toBeInTheDocument();
  });

  it("set: shows the places taken and left", async () => {
    mockFetch(routes({ eventCapacity: 26, taken: 14 }));
    renderWithConfig(<PriceEditModal {...props()} />);
    expect(await screen.findByTestId("event-capacity-status")).toHaveTextContent("14 of 26 taken, 12 left");
  });

  it("is hidden when the capacity cannot be read (nothing saved for it)", async () => {
    mockFetch(routes(null));
    renderWithConfig(<PriceEditModal {...props()} />);
    expect(await screen.findByText("Dinner, wine included")).toBeInTheDocument();
    expect(screen.queryByText("Event capacity (optional)")).not.toBeInTheDocument();
  });

  it("Save writes a changed number through PUT /capacity, without the notify prompt", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(routes({ eventCapacity: null, taken: 14 }, [
      { method: "PUT", url: /\/events\/evt-1\/capacity$/, bodyFn: (init: any) => ({ ...JSON.parse(init.body), taken: 14, ticketsTotal: 36 }) },
    ]));
    renderWithConfig(<PriceEditModal {...props()} />);
    await user.type(await screen.findByPlaceholderText("Not set"), "26");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(capacityPuts(fetchMock)).toHaveLength(1));
    expect(JSON.parse(capacityPuts(fetchMock)[0][1].body)).toEqual({ eventCapacity: 26 });
    expect(screen.queryByText(/update ticket pricing\?/i)).not.toBeInTheDocument();
  });

  it("clearing it saves null", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(routes({ eventCapacity: 26, taken: 0 }, [
      { method: "PUT", url: /\/events\/evt-1\/capacity$/, body: { eventCapacity: null, taken: 0, ticketsTotal: 36 } },
    ]));
    renderWithConfig(<PriceEditModal {...props()} />);
    const input = await screen.findByDisplayValue("26");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(capacityPuts(fetchMock)).toHaveLength(1));
    expect(JSON.parse(capacityPuts(fetchMock)[0][1].body)).toEqual({ eventCapacity: null });
  });

  it("refuses a number below the places already taken, before writing anything", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(routes({ eventCapacity: null, taken: 14 }));
    renderWithConfig(<PriceEditModal {...props()} />);
    await user.type(await screen.findByPlaceholderText("Not set"), "10");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText(/can't be lower than the 14 places already taken/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c: any) => c[1]?.method === "PUT")).toBe(false);
  });

  it("inside a ticket: says it also counts toward the event's places", async () => {
    const user = userEvent.setup();
    mockFetch(routes({ eventCapacity: 26, taken: 14 }));
    renderWithConfig(<PriceEditModal {...props()} />);
    await user.click(await screen.findByRole("button", { name: /Dinner, without wine/ }));
    expect(await screen.findByTestId("shares-event-capacity"))
      .toHaveTextContent("This ticket also counts toward the event's 26 places, which every ticket shares. 12 of them are left.");
  });

  it("the create wizard (draftMode) shows no card and reads nothing", async () => {
    const fetchMock = mockFetch([]);
    renderWithConfig(
      <PriceEditModal communityTag="c-1" onClose={vi.fn()} onSaved={vi.fn()} showToast={vi.fn()} draftMode onDraftCommit={vi.fn()} />,
    );
    await screen.findByRole("button", { name: /Standard/ });
    expect(screen.queryByText("Event capacity (optional)")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
