/**
 * "Complimentary" means a paid event with no payment behind the place. When
 * the viewer may not read the community's sales (the list answers with an
 * error), a missing match proves nothing, so the label must not appear.
 */

import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { AttendeesAndInvitationsSection } from "../components/AttendeesAndInvitationsSection";
import { renderWithConfig, mockFetch } from "./test-utils";

const emptyStatsRoute = { url: "/invitations/stats", body: { totalInvited: 0, accepted: 0, pending: 0, expired: 0, cancelled: 0, byInviter: [] } };
const emptyInvitationsRoute = { url: "/invitations", body: { invitations: [] } };

const event = {
    id: "evt-1",
    slug: "evt-1",
    requiresApproval: false,
    price: 1000,
    currency: "EUR",
    refundPolicy: null,
    attendees: [
        { id: "att-1", userId: "u-1", status: "APPROVED", name: "Ana Buyer", email: "ana@example.com", user: { id: "u-1", name: "Ana Buyer", usertag: "ana", email: "ana@example.com" }, tier: { id: "t", name: "Standard" } },
    ],
};

describe("AttendeesAndInvitationsSection: Complimentary needs the sales list", () => {
    it("shows no Complimentary label when the sales list is forbidden", async () => {
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, status: 403, body: { error: "You do not have permission to perform this action" } },
        ]);
        renderWithConfig(<AttendeesAndInvitationsSection event={event} communityTag="c" isPublished={true} isPast={false} />);
        await waitFor(() => expect(screen.getByText("Ana Buyer")).toBeInTheDocument());
        await new Promise((r) => setTimeout(r, 50));
        expect(screen.queryByText(/Complimentary/)).not.toBeInTheDocument();
    });

    it("still shows Complimentary when sales loaded and none matches", async () => {
        mockFetch([emptyStatsRoute, emptyInvitationsRoute, { url: /\/sales/, body: { sales: [] } }]);
        renderWithConfig(<AttendeesAndInvitationsSection event={event} communityTag="c" isPublished={true} isPast={false} />);
        await waitFor(() => expect(screen.getByText(/Complimentary/)).toBeInTheDocument());
    });
});
