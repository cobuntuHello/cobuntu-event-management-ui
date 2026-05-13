import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DuplicateModal } from "../components/DuplicateModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const event = { id: "evt-1", name: "Original" };
const baseProps = (overrides: any = {}) => ({
  event,
  communityTag: "c-1",
  onClose: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

describe("DuplicateModal", () => {
  it("calls onDuplicated with the new event from the backend response", async () => {
    const user = userEvent.setup();
    const onDuplicated = vi.fn();
    mockFetch([
      { method: "POST", url: "/events/evt-1/duplicate", body: { event: { id: "evt-2", slug: "original-copy" } } },
    ]);
    const props = baseProps({ onDuplicated });
    renderWithConfig(<DuplicateModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^duplicate$/i }));

    await waitFor(() => expect(onDuplicated).toHaveBeenCalledWith({ id: "evt-2", slug: "original-copy" }));
    expect(props.showToast).toHaveBeenCalledWith("Event duplicated");
  });

  it("handles flat response shape `{ id, slug }` (legacy backend)", async () => {
    const user = userEvent.setup();
    const onDuplicated = vi.fn();
    mockFetch([
      { method: "POST", url: "/events/evt-1/duplicate", body: { id: "evt-2", slug: "original-copy" } },
    ]);
    renderWithConfig(<DuplicateModal {...baseProps({ onDuplicated })} />);

    await user.click(screen.getByRole("button", { name: /^duplicate$/i }));

    await waitFor(() => expect(onDuplicated).toHaveBeenCalledWith({ id: "evt-2", slug: "original-copy" }));
  });

  it("toasts failure on non-2xx, does not call onDuplicated", async () => {
    const user = userEvent.setup();
    const onDuplicated = vi.fn();
    mockFetch([
      { method: "POST", url: "/events/evt-1/duplicate", status: 500, body: {} },
    ]);
    const props = baseProps({ onDuplicated });
    renderWithConfig(<DuplicateModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^duplicate$/i }));

    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith("Failed to duplicate"));
    expect(onDuplicated).not.toHaveBeenCalled();
  });
});
