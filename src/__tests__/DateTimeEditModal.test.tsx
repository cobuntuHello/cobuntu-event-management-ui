import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTimeEditModal } from "../components/DateTimeEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const event = {
  id: "evt-1",
  startDate: "2026-06-01T15:00:00Z",
  endDate: "2026-06-01T17:00:00Z",
  timezone: "UTC",
};

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  event,
  communityTag: "c-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

describe("DateTimeEditModal", () => {
  it("renders the modal heading", () => {
    renderWithConfig(<DateTimeEditModal {...baseProps()} />);
    expect(screen.getByText(/edit date & time/i)).toBeInTheDocument();
  });

  it("on Save: PUTs to /events/:id with ISO startDate + endDate + timezone, toasts, calls onSaved", async () => {
    const fetchMock = mockFetch([
      { method: "PUT", url: "/events/evt-1", body: { ok: true } },
    ]);
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<DateTimeEditModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(props.showToast).toHaveBeenCalledWith("Date updated");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toHaveProperty("startDate");
    expect(body).toHaveProperty("endDate");
    expect(body).toHaveProperty("timezone");
    expect(typeof body.startDate).toBe("string");
    expect(typeof body.endDate).toBe("string");
  });

  it("on backend error: surfaces the error via showToast, does NOT call onSaved", async () => {
    mockFetch([
      { method: "PUT", url: "/events/evt-1", status: 400, body: { error: "Invalid date" } },
    ]);
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<DateTimeEditModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith("Invalid date"));
    expect(props.onSaved).not.toHaveBeenCalled();
  });
});

/**
 * The organiser edits WALL CLOCK in the event's own timezone. The browser's
 * timezone must never enter the calculation.
 *
 * Regression (shipped in v0.2.47, fixed here): the conversion built an ISO
 * string with a doubled seconds field ("...T15:00:00:00Z"), so every save threw
 * RangeError before reaching the network and date/time editing was dead. The
 * offset was also applied with the wrong sign, so once it stopped throwing it
 * still returned the wrong instant unless the browser happened to sit in the
 * event's own zone (which is why it looked fine locally). A New York browser
 * editing a 15:00 Lisbon event produced the next day at 00:00Z.
 *
 * These assert the emitted instant exactly. vitest pins TZ=UTC, so the
 * "browser" here is UTC while the events are not: any reintroduction of a
 * local-time getter shifts the result and fails.
 */
describe("DateTimeEditModal — timezone correctness", () => {
  const lisbonEvent = {
    id: "evt-1",
    // 15:00 Lisbon (UTC+1 in July) === 14:00Z
    startDate: "2026-07-01T14:00:00Z",
    endDate: "2026-07-01T16:00:00Z",
    timezone: "Europe/Lisbon",
  };

  async function saveAndReadBody(props: Record<string, unknown>) {
    const fetchMock = mockFetch([{ method: "PUT", url: "/events/evt-1", body: { ok: true } }]);
    const user = userEvent.setup();
    renderWithConfig(<DateTimeEditModal {...(props as any)} />);
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    return JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  }

  it("round-trips an untouched event to the SAME instant it started at", async () => {
    const body = await saveAndReadBody(baseProps({ event: lisbonEvent }));
    // Opening the modal and saving without editing must not move the event.
    expect(body.startDate).toBe("2026-07-01T14:00:00.000Z");
    expect(body.endDate).toBe("2026-07-01T16:00:00.000Z");
    expect(body.timezone).toBe("Europe/Lisbon");
  });

  it("seeds the time fields with the EVENT's wall clock, not the browser's", async () => {
    renderWithConfig(<DateTimeEditModal {...baseProps({ event: lisbonEvent })} />);
    // 14:00Z is 15:00 in Lisbon. A browser-timezone read (UTC here) would show
    // 14:00. EventTimestamps renders the time as button text, not an input.
    expect(screen.getByText("15:00")).toBeInTheDocument();
    expect(screen.getByText("17:00")).toBeInTheDocument();
    expect(screen.queryByText("14:00")).not.toBeInTheDocument();
  });

  it("keeps the event-zone calendar day for a time that crosses midnight elsewhere", async () => {
    // 23:30 Tokyo on Jul 1 === 14:30Z Jul 1. In UTC the wall clock is still the
    // 1st, but the zone offset is large enough to catch a sign error.
    const tokyoEvent = {
      id: "evt-1",
      startDate: "2026-07-01T14:30:00Z",
      endDate: "2026-07-01T15:30:00Z",
      timezone: "Asia/Tokyo",
    };
    const body = await saveAndReadBody(baseProps({ event: tokyoEvent }));
    expect(body.startDate).toBe("2026-07-01T14:30:00.000Z");
    expect(body.endDate).toBe("2026-07-01T15:30:00.000Z");
  });

  it("round-trips across a DST transition day", async () => {
    // Lisbon springs forward 2026-03-29. 03:30 local === 02:30Z.
    const dstEvent = {
      id: "evt-1",
      startDate: "2026-03-29T02:30:00Z",
      endDate: "2026-03-29T03:30:00Z",
      timezone: "Europe/Lisbon",
    };
    const body = await saveAndReadBody(baseProps({ event: dstEvent }));
    expect(body.startDate).toBe("2026-03-29T02:30:00.000Z");
    expect(body.endDate).toBe("2026-03-29T03:30:00.000Z");
  });

  it("emits a valid ISO instant (the doubled-seconds RangeError regression)", async () => {
    const body = await saveAndReadBody(baseProps({ event: lisbonEvent }));
    expect(Number.isNaN(Date.parse(body.startDate))).toBe(false);
    expect(body.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
