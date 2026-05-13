import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteModal } from "../components/DeleteModal";
import { renderWithConfig } from "./test-utils";

const event = { id: "evt-1", name: "Big party", startDate: "2026-06-01T18:00:00Z", bannerUrl: null };
const baseProps = (overrides: Record<string, unknown> = {}) => ({
  event,
  isPaid: false,
  attendeeCount: 0,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  ...overrides,
});

describe("DeleteModal", () => {
  it("renders the event name", () => {
    renderWithConfig(<DeleteModal {...baseProps()} />);
    expect(screen.getByText("Big party")).toBeInTheDocument();
  });

  it("Delete button calls onConfirm", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<DeleteModal {...props} />);

    await user.click(screen.getByRole("button", { name: /delete event/i }));
    expect(props.onConfirm).toHaveBeenCalled();
  });

  it("Cancel button calls onClose (not onConfirm)", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<DeleteModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("shows the attendee-notification warning when attendeeCount > 0", () => {
    renderWithConfig(<DeleteModal {...baseProps({ attendeeCount: 3 })} />);
    expect(screen.getByText(/3 people are registered/i)).toBeInTheDocument();
  });

  it("shows the auto-refund warning when isPaid is true", () => {
    renderWithConfig(<DeleteModal {...baseProps({ isPaid: true })} />);
    expect(screen.getByText(/automatic refunds/i)).toBeInTheDocument();
  });

  it("hides the attendee + refund warnings when free and empty", () => {
    renderWithConfig(<DeleteModal {...baseProps()} />);
    expect(screen.queryByText(/people are registered/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/automatic refunds/i)).not.toBeInTheDocument();
  });
});
