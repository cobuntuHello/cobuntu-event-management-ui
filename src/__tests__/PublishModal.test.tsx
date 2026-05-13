import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublishModal } from "../components/PublishModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const baseProps = (overrides: any = {}) => ({
  event: { id: "evt-1" },
  communityTag: "c-1",
  isPublished: false,
  isPaid: false,
  attendeeCount: 0,
  missingRequirements: [],
  onClose: vi.fn(),
  onDone: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

describe("PublishModal — endpoint routing", () => {
  it("posts to /publish when isPublished=false", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { method: "POST", url: /\/events\/evt-1\/publish$/, body: {} },
    ]);
    const props = baseProps();
    renderWithConfig(<PublishModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^publish$/i }));

    await waitFor(() => expect(props.onDone).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/events\/evt-1\/publish$/);
    expect(props.showToast).toHaveBeenCalledWith("Published");
  });

  it("posts to /unpublish when isPublished=true", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { method: "POST", url: /\/events\/evt-1\/unpublish$/, body: {} },
    ]);
    const props = baseProps({ isPublished: true });
    renderWithConfig(<PublishModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^unpublish$/i }));

    await waitFor(() => expect(props.onDone).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/events\/evt-1\/unpublish$/);
    expect(props.showToast).toHaveBeenCalledWith("Unpublished");
  });

  it("disables Publish when missingRequirements is non-empty", () => {
    renderWithConfig(<PublishModal {...baseProps({ missingRequirements: ["add a title"] })} />);
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeDisabled();
    expect(screen.getByText(/cannot publish yet/i)).toBeInTheDocument();
  });

  it("warns about automatic refunds when unpublishing a paid event", () => {
    renderWithConfig(<PublishModal {...baseProps({ isPublished: true, isPaid: true })} />);
    expect(screen.getByText(/automatic refunds/i)).toBeInTheDocument();
  });
});
