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
