import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { OverviewActionCards } from "../page/sections/OverviewActionCards";

/**
 * The Settings action is HIDDEN, not disabled, on a user-owned event.
 *
 * Everything behind it — visibility, access, distribution, after-checkout — is
 * a statement about a COMMUNITY: who among its members may see or RSVP, where
 * its storefront sends people. A personal event has no membership to gate
 * against, and the backend refuses all of them with a 403.
 *
 * Mirrors the identical rule on products. A disabled card would advertise a
 * capability this event cannot have and invite "how do I unlock it?", which
 * has no answer.
 */

const actions = {
  onShare: vi.fn(),
  onEdit: vi.fn(),
  onDuplicate: vi.fn(),
  onPublish: vi.fn(),
  onUnpublish: vi.fn(),
  onDelete: vi.fn(),
  onGroupChat: vi.fn(),
};

const base = {
  isPublished: false,
  isEventPast: false,
  isEventLive: false,
  hasPaidAttendees: false,
  groupChatExists: false,
  ...actions,
};

beforeEach(() => vi.clearAllMocks());

describe("OverviewActionCards — Settings gating", () => {
  it("shows Settings for a community-owned event", () => {
    renderWithConfig(<OverviewActionCards {...base} canConfigureSettings />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("does NOT render Settings for a user-owned event", () => {
    renderWithConfig(<OverviewActionCards {...base} canConfigureSettings={false} />);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("hides it rather than disabling it", () => {
    renderWithConfig(<OverviewActionCards {...base} canConfigureSettings={false} />);
    const disabled = screen.queryAllByRole("button").filter((b) => (b as HTMLButtonElement).disabled);
    expect(disabled.some((b) => b.textContent?.includes("Settings"))).toBe(false);
  });

  it("keeps every other action", () => {
    // Hiding Settings must not take Share or Delete with it.
    renderWithConfig(<OverviewActionCards {...base} canConfigureSettings={false} />);
    expect(screen.getByText("Share Event")).toBeInTheDocument();
    expect(screen.getByText(/Delete/i)).toBeInTheDocument();
  });

  it("defaults to showing it, so an un-updated consumer is unchanged", () => {
    // The prop is new; a consumer that has not passed it yet must not silently
    // lose the action.
    renderWithConfig(<OverviewActionCards {...base} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });
});
