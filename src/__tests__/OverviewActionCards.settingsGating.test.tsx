import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { OverviewActionCards } from "../page/sections/OverviewActionCards";

/**
 * `canConfigureSettings` is a capability switch on the CARD, not a rule.
 *
 * It used to be derived from ownership — OverviewView passed
 * `!!event.communityId`, so a personal event lost the Settings button
 * entirely. That was wrong: two of the settings behind it (Approval, Refund
 * policy) are the HOST's own, and the backend allows both on a user-owned
 * event. The drawer scopes its own rows now and the manage page always passes
 * true; see SettingsDrawer.test.tsx for the row-level rule.
 *
 * The prop stays because hiding the card is still the right shape when a
 * consumer genuinely has nothing to put behind it — a disabled card would
 * advertise a capability and invite "how do I unlock it?", which has no
 * answer. These pin that mechanism.
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
