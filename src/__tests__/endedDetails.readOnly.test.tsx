import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { OverviewActionCards } from "../page/sections/OverviewActionCards";
import { EventCard } from "../page/sections/EventCard";

/**
 * T-370: an ended event's Details tab cannot change anything, so nothing on
 * it may LOOK like it can. Every action that writes is disabled; Share,
 * Duplicate and opening an existing group chat still work (they change
 * nothing on this event). The fields read as plain text, with no pencil.
 */

const actions = {
  onShare: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(), onPublish: vi.fn(), onUnpublish: vi.fn(),
  onDelete: vi.fn(), onGroupChat: vi.fn(), onPrivateHire: vi.fn(), onEventAddons: vi.fn(),
};
const cardsBase = { isPublished: true, isEventPast: true, isEventLive: false, hasPaidAttendees: false, groupChatExists: false, ...actions };

beforeEach(() => vi.clearAllMocks());

const button = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("OverviewActionCards read-only", () => {
  it("disables everything that writes, and keeps Share and Duplicate", () => {
    renderWithConfig(<OverviewActionCards {...cardsBase} readOnly />);
    for (const name of [/settings/i, /create group/i, /private hire/i, /add-ons|addons/i, /unpublish/i, /delete/i]) {
      expect(button(name).disabled).toBe(true);
    }
    expect(button(/share/i).disabled).toBe(false);
    expect(button(/duplicate/i).disabled).toBe(false);
    fireEvent.click(button(/duplicate/i));
    expect(actions.onDuplicate).toHaveBeenCalled();
  });

  it("still opens a group chat that exists", () => {
    renderWithConfig(<OverviewActionCards {...cardsBase} groupChatExists readOnly />);
    const chat = screen.getAllByRole("button").find((b) => /group chat/i.test(b.textContent ?? ""))! as HTMLButtonElement;
    expect(chat.disabled).toBe(false);
  });

  it("changes nothing when not read-only", () => {
    renderWithConfig(<OverviewActionCards {...cardsBase} isEventPast={false} />);
    expect(button(/settings/i).disabled).toBe(false);
    expect(button(/private hire/i).disabled).toBe(false);
  });
});

const event = {
  id: "e1", name: "Tewt", slug: "tewt", physicalLocation: "Porto", onlineUrl: null, bannerUrl: null,
  startDate: "2026-11-10T18:00:00Z", endDate: "2026-11-13T12:00:00Z", tags: [],
};
const cardProps = {
  event, communityTag: "community", isPublished: true, isPast: true, isLive: false, isPaid: false, attendeeCount: 7,
  missingRequirements: [],
  onEditName: vi.fn(), onEditDateTime: vi.fn(), onEditLocation: vi.fn(), onEditPrice: vi.fn(),
  onEditSlug: vi.fn(), onEditBanner: vi.fn(), onEditTags: vi.fn(),
};

describe("EventCard read-only", () => {
  it("offers no field edits and says Not set instead of Add tags", () => {
    renderWithConfig(<EventCard {...cardProps} readOnly />);
    expect(screen.queryByText(/add tags/i)).toBeNull();
    expect(screen.getByText(/not set/i)).toBeTruthy();
    for (const label of ["Tewt", "Porto"]) {
      fireEvent.click(screen.getByText(label));
    }
    expect(cardProps.onEditName).not.toHaveBeenCalled();
    expect(cardProps.onEditLocation).not.toHaveBeenCalled();
    expect(cardProps.onEditTags).not.toHaveBeenCalled();
  });

  it("keeps Add tags for a host who can still edit", () => {
    renderWithConfig(<EventCard {...cardProps} isPast={false} />);
    expect(screen.getByText(/add tags/i)).toBeTruthy();
  });
});
