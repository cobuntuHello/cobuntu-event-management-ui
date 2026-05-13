import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationEditModal } from "../components/LocationEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const event = {
  id: "evt-1",
  physicalLocation: "123 Main St",
  onlineUrl: "https://meet.example.com/room",
};

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  event,
  communityTag: "c-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

describe("LocationEditModal", () => {
  it("renders the heading and preloads the existing physical + online locations", () => {
    renderWithConfig(<LocationEditModal {...baseProps()} />);
    expect(screen.getByText(/edit location/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("123 Main St")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://meet.example.com/room")).toBeInTheDocument();
  });

  it("on Save: PUTs trimmed physicalLocation + onlineUrl, toasts, calls onSaved", async () => {
    const fetchMock = mockFetch([
      { method: "PUT", url: "/events/evt-1", body: { ok: true } },
    ]);
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<LocationEditModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(props.showToast).toHaveBeenCalledWith("Location updated");

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      physicalLocation: "123 Main St",
      onlineUrl: "https://meet.example.com/room",
    });
  });

  it("on backend error: surfaces the error via showToast, does NOT call onSaved", async () => {
    mockFetch([
      { method: "PUT", url: "/events/evt-1", status: 400, body: { error: "Bad URL" } },
    ]);
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<LocationEditModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith("Bad URL"));
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("blank physical + online fields PUT null for both", async () => {
    const fetchMock = mockFetch([
      { method: "PUT", url: "/events/evt-1", body: { ok: true } },
    ]);
    const user = userEvent.setup();
    renderWithConfig(<LocationEditModal {...baseProps({ event: { id: "evt-1", physicalLocation: "", onlineUrl: "" } })} />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ physicalLocation: null, onlineUrl: null });
  });
});
