import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationEditModal } from "../components/LocationEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
      physicalLatitude: null,
      physicalLongitude: null,
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
    expect(body).toEqual({
      physicalLocation: null,
      onlineUrl: null,
      physicalLatitude: null,
      physicalLongitude: null,
    });
  });

  it("preloaded physicalLatitude/Longitude are forwarded to the backend on save", async () => {
    // Regression guard for the previous bug where the modal dropped
    // coordinates on the floor — the community-app event detail map
    // requires both lat AND lng to render, so any save that omitted
    // them silently disabled the map for that event.
    const fetchMock = mockFetch([
      { method: "PUT", url: "/events/evt-1", body: { ok: true } },
    ]);
    const user = userEvent.setup();
    renderWithConfig(
      <LocationEditModal
        {...baseProps({
          event: {
            id: "evt-1",
            physicalLocation: "Casa Capitão",
            onlineUrl: "",
            physicalLatitude: 38.7223,
            physicalLongitude: -9.1393,
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.physicalLatitude).toBe(38.7223);
    expect(body.physicalLongitude).toBe(-9.1393);
  });
});

describe("the location field's affordances", () => {
  /*
   * The clear control was a bare 16px X pinned to `right-3` — the same
   * coordinate as the loading spinner, so the two sat on top of each other
   * mid-search — and it carried no accessible name at all.
   */
  it("names the in-field clear control", async () => {
    const { EventLocationSelector } = await import("../ui/event-location-selector");
    renderWithConfig(
      <EventLocationSelector
        physicalLocation="Rua Garrett 10"
        onlineUrl=""
        onPhysicalLocationChange={vi.fn()}
        onOnlineUrlChange={vi.fn()}
        hideHeader
      />,
    );
    expect(screen.getByLabelText("Remove location")).toBeInTheDocument();
  });

  it("offers a named Remove once an address is in", async () => {
    const { EventLocationSelector } = await import("../ui/event-location-selector");
    const onChange = vi.fn();
    renderWithConfig(
      <EventLocationSelector
        physicalLocation="Rua Garrett 10"
        onlineUrl=""
        onPhysicalLocationChange={onChange}
        onOnlineUrlChange={vi.fn()}
        hideHeader
      />,
    );
    const remove = screen.getByRole("button", { name: "Remove" });
    await userEvent.click(remove);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("shows nothing to remove when the field is empty", async () => {
    const { EventLocationSelector } = await import("../ui/event-location-selector");
    renderWithConfig(
      <EventLocationSelector
        physicalLocation=""
        onlineUrl=""
        onPhysicalLocationChange={vi.fn()}
        onOnlineUrlChange={vi.fn()}
        hideHeader
      />,
    );
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remove location")).not.toBeInTheDocument();
  });
});

describe("the location modal's chrome", () => {
  it("has no top-right X — it carries its own bottom actions", () => {
    const src = readFileSync(resolve(__dirname, "../components/EventForm.tsx"), "utf8");
    const modal = src.slice(src.indexOf("Location Modal"), src.indexOf("Tags Modal"));
    expect(modal).toContain("hideClose");
  });

  it("closes with a secondary button, not an outline one", () => {
    // An outline Cancel reads as equal weight to Done and competes with it.
    const src = readFileSync(resolve(__dirname, "../components/EventForm.tsx"), "utf8");
    const modal = src.slice(src.indexOf("Location Modal"), src.indexOf("Tags Modal"));
    // `[^>]*` cannot cross the `>` in the onClick arrow function.
    expect(modal).toMatch(/variant="secondary"[\s\S]*?>Cancel</);
    expect(modal).not.toMatch(/variant="outline"[\s\S]{0,80}?>Cancel</);
  });
});
