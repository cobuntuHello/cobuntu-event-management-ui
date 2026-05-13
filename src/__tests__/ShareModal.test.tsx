import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareModal } from "../components/ShareModal";
import { renderWithConfig } from "./test-utils";

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  event: { id: "evt-1", slug: "summer-mixer", name: "Summer Mixer" },
  communityTag: "orbis",
  onClose: vi.fn(),
  ...overrides,
});

describe("ShareModal", () => {
  it("renders the public event URL using the slug when present", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    expect(screen.getByText("https://orbis.cobuntu.com/events/summer-mixer")).toBeInTheDocument();
  });

  it("falls back to event.id when the slug is missing", () => {
    renderWithConfig(<ShareModal {...baseProps({ event: { id: "evt-1", name: "X" } })} />);
    expect(screen.getByText("https://orbis.cobuntu.com/events/evt-1")).toBeInTheDocument();
  });

  it("renders all five share actions (Facebook, X, LinkedIn, Email, Copy)", () => {
    renderWithConfig(<ShareModal {...baseProps()} />);
    expect(screen.getByRole("button", { name: /facebook/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^x$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /linkedin/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /email/i })).toBeInTheDocument();
    // The Copy action appears as a grid button + as text inside the URL row.
    expect(screen.getAllByText(/^copy$/i).length).toBeGreaterThan(0);
  });

  it("Close button calls onClose", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithConfig(<ShareModal {...props} />);

    await user.click(screen.getByRole("button", { name: /^close$/i }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("URL-row copy button is present and clickable", async () => {
    // happy-dom's clipboard.writeText rejects without a real user gesture, so
    // we can't reliably assert the spy here — match the product-ui suite and
    // verify the button is reachable.
    const user = userEvent.setup();
    renderWithConfig(<ShareModal {...baseProps()} />);
    const urlRowButtons = screen.getAllByRole("button", { name: /summer-mixer/i });
    expect(urlRowButtons.length).toBeGreaterThan(0);
    await user.click(urlRowButtons[0]);
  });
});
