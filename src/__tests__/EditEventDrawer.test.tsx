import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditEventDrawer } from "../components/EditEventDrawer";
import { renderWithConfig, mockFetch } from "./test-utils";

vi.mock("react-quill-new", () => ({ default: () => null }));

const event = {
  id: "evt-1",
  name: "Summer Mixer",
  description: "",
  startDate: "2026-06-01T15:00:00Z",
  endDate: "2026-06-01T17:00:00Z",
  timezone: "UTC",
  physicalLocation: "",
  onlineUrl: "",
  accessibility: "PUBLIC",
  tags: [],
};

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  event,
  communityTag: "orbis",
  isOpen: true,
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

// Stripe status is fetched on mount — provide a successful default so the
// effect resolves quietly and doesn't block UI assertions.
const stripeRoute = { method: "GET" as const, url: "/stripe/connected", body: { connected: true, chargesEnabled: true } };

describe("EditEventDrawer", () => {
  it("renders nothing when isOpen is false", () => {
    mockFetch([stripeRoute]);
    renderWithConfig(<EditEventDrawer {...baseProps({ isOpen: false })} />);
    expect(screen.queryByRole("heading", { name: /edit event/i })).not.toBeInTheDocument();
  });

  it("when isOpen is true: renders the drawer with the event name preloaded", async () => {
    mockFetch([stripeRoute]);
    renderWithConfig(<EditEventDrawer {...baseProps()} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: /edit event/i })).toBeInTheDocument());
    expect(screen.getByDisplayValue("Summer Mixer")).toBeInTheDocument();
  });

  it("clicking Update opens the 3-option notify-attendees confirm dialog", async () => {
    mockFetch([stripeRoute]);
    const user = userEvent.setup();
    renderWithConfig(<EditEventDrawer {...baseProps()} />);

    await waitFor(() => expect(screen.getByDisplayValue("Summer Mixer")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^update$/i }));

    expect(screen.getByText(/update this event\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /yes, notify attendees/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /yes, do not notify attendees/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /no, cancel/i })).toBeInTheDocument();
  });

  it("'Yes, notify attendees': PUTs body with notifyAttendees=true and eventually calls onSaved", async () => {
    const fetchMock = mockFetch([
      stripeRoute,
      { method: "PUT", url: "/events/evt-1", body: { ok: true } },
    ]);
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<EditEventDrawer {...props} />);

    await waitFor(() => expect(screen.getByDisplayValue("Summer Mixer")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^update$/i }));
    await user.click(screen.getByRole("button", { name: /yes, notify attendees/i }));

    // onSaved fires after the 1.5s success-state delay
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled(), { timeout: 5000 });

    const putCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === "PUT");
    expect(putCall).toBeDefined();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({ name: "Summer Mixer", notifyAttendees: true });
  }, 8000);

  it("'Yes, do not notify attendees': PUTs body with notifyAttendees=false", async () => {
    const fetchMock = mockFetch([
      stripeRoute,
      { method: "PUT", url: "/events/evt-1", body: { ok: true } },
    ]);
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<EditEventDrawer {...props} />);

    await waitFor(() => expect(screen.getByDisplayValue("Summer Mixer")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^update$/i }));
    await user.click(screen.getByRole("button", { name: /yes, do not notify attendees/i }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalled(), { timeout: 5000 });

    const putCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === "PUT");
    expect(putCall).toBeDefined();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.notifyAttendees).toBe(false);
  }, 8000);

  it("'No, cancel': dismisses the confirm dialog without PUTting", async () => {
    const fetchMock = mockFetch([stripeRoute]);
    const user = userEvent.setup();
    renderWithConfig(<EditEventDrawer {...baseProps()} />);

    await waitFor(() => expect(screen.getByDisplayValue("Summer Mixer")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^update$/i }));
    await user.click(screen.getByRole("button", { name: /no, cancel/i }));

    expect(screen.queryByText(/update this event\?/i)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === "PUT")).toBeUndefined();
  });
});
