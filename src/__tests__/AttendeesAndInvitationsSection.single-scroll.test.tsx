/**
 * The Attendees tab has ONE scroller: the page. Each sub-tab list
 * (Registered, Cancelled, Invitations, and the rest) and the "By Host"
 * breakdown grow to their full height instead of sitting in a
 * fixed-height box with its own scrollbar inside a page that also
 * scrolls. Before this, a 47-person Registered list was capped at 400px
 * and scrolled on its own while the page scrolled around it.
 *
 * jsdom does no layout, so the guard is on the classes that would create
 * an inner vertical scroller: any max-h-* cap, overflow-y-auto/scroll or
 * overflow-auto/scroll. The sub-tab strip's horizontal overflow-x-auto
 * (for phones) is allowed: it never scrolls vertically.
 */

import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendeesAndInvitationsSection } from "../components/AttendeesAndInvitationsSection";
import { renderWithConfig, mockFetch } from "./test-utils";

const VERTICAL_SCROLL_CLASS = /(^|\s)(max-h-\S+|overflow-y-(auto|scroll)|overflow-(auto|scroll))(?=\s|$)/;

function innerVerticalScrollers(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll("*"))
        // getAttribute, not className: on SVG nodes className is an
        // SVGAnimatedString, not a string.
        .map((el) => el.getAttribute("class") || "")
        .filter((cls) => VERTICAL_SCROLL_CLASS.test(cls));
}

const registered = Array.from({ length: 47 }, (_, i) => ({
    id: `att-${i + 1}`,
    userId: null,
    status: "APPROVED",
    name: `Guest ${i + 1}`,
    email: `guest${i + 1}@example.com`,
    tier: { id: "tier-1", name: "Standard" },
}));

const event = {
    id: "evt-1",
    slug: "evt-1",
    requiresApproval: false,
    price: 0,
    currency: "EUR",
    attendees: [
        ...registered,
        {
            id: "att-cancelled",
            userId: null,
            status: "CANCELLED",
            name: "Cancelled Person",
            email: "cancelled@example.com",
            tier: { id: "tier-1", name: "Standard" },
        },
    ],
};

// Pending invitations sent by several hosts, so both the Invitations
// sub-tab list and the "By Host" breakdown in the stats hero render.
const invitations = Array.from({ length: 8 }, (_, i) => ({
    id: `inv-${i + 1}`,
    email: `invitee${i + 1}@example.com`,
    status: "PENDING",
    invitedAt: "2026-11-20T10:00:00.000Z",
    invitedBy: `host-${i + 1}`,
    users: { id: `host-${i + 1}`, name: `Host ${i + 1}`, profileImage: null },
}));

function renderSection() {
    mockFetch([
        { url: /\/invitations$/, body: { invitations } },
        { url: /\/sales/, body: { sales: [] } },
    ]);
    return renderWithConfig(
        <AttendeesAndInvitationsSection event={event} communityTag="c" isPublished={true} isPast={false} />,
    );
}

describe("AttendeesAndInvitationsSection: the page is the only scroller", () => {
    it("Registered: all 47 rows render with no fixed-height inner scroll box", async () => {
        const { container } = renderSection();
        await waitFor(() => expect(screen.getByText("Guest 47")).toBeInTheDocument());
        expect(screen.getByText("Guest 1")).toBeInTheDocument();
        expect(innerVerticalScrollers(container)).toEqual([]);
    });

    it("Cancelled: the list has no fixed-height inner scroll box", async () => {
        const { container } = renderSection();
        await userEvent.click(await screen.findByRole("button", { name: /^Cancelled/ }));
        expect(await screen.findByText("Cancelled Person")).toBeInTheDocument();
        expect(innerVerticalScrollers(container)).toEqual([]);
    });

    it("Invitations: the list and the By Host breakdown have no fixed-height inner scroll box", async () => {
        const { container } = renderSection();
        // By Host lists every host in the stats hero, above the sub-tabs.
        expect(await screen.findByText("By Host")).toBeInTheDocument();
        expect(screen.getByText("Host 8")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /^Invitations/ }));
        expect(await screen.findByText("invitee8@example.com", { selector: "p.font-medium" })).toBeInTheDocument();
        expect(innerVerticalScrollers(container)).toEqual([]);
    });
});
