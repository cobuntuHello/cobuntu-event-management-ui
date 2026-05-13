import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NameEditModal } from "../components/NameEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const event = { id: "evt-1", name: "Old name" };
const baseProps = (overrides: any = {}) => ({
  event,
  communityTag: "c-1",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

describe("NameEditModal", () => {
  it("preloads the existing event name", () => {
    renderWithConfig(<NameEditModal {...baseProps()} />);
    expect(screen.getByDisplayValue("Old name")).toBeInTheDocument();
  });

  it("on Save: PUTs the new name, toasts, calls onSaved", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { method: "PUT", url: "/events/evt-1", body: { ok: true } },
    ]);
    const props = baseProps();
    renderWithConfig(<NameEditModal {...props} />);

    const input = screen.getByDisplayValue("Old name");
    await user.clear(input);
    await user.type(input, "New name");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ name: "New name" });
    expect(props.showToast).toHaveBeenCalledWith("Name updated");
  });

  it("on Save failure: toasts the backend error, does NOT call onSaved", async () => {
    const user = userEvent.setup();
    mockFetch([
      { method: "PUT", url: "/events/evt-1", status: 400, body: { error: "Name taken" } },
    ]);
    const props = baseProps();
    renderWithConfig(<NameEditModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith("Name taken"));
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("disables Save when the name is empty", async () => {
    const user = userEvent.setup();
    renderWithConfig(<NameEditModal {...baseProps()} />);

    const input = screen.getByDisplayValue("Old name");
    await user.clear(input);

    const saveBtn = screen.getByRole("button", { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
  });
});
