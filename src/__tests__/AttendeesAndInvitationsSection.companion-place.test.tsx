/**
 * A companion place (extra ticket bought by someone else, no user and no
 * email of its own) must show the name the buyer typed and who bought it,
 * be matched to its sale by saleId, and never be labelled "Complimentary".
 * Before this, such a place rendered as "Guest 1 / Complimentary" even though
 * it was paid for.
 */

import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { AttendeesAndInvitationsSection } from "../components/AttendeesAndInvitationsSection";
import { renderWithConfig, mockFetch } from "./test-utils";

const emptyStatsRoute = { url: "/invitations/stats", body: { totalInvited: 0, accepted: 0, pending: 0, expired: 0, cancelled: 0, byInviter: [] } };
const emptyInvitationsRoute = { url: "/invitations", body: { invitations: [] } };

function sale(id: string) {
    return {
        id,
        createdAt: "2026-06-17T10:00:00.000Z",
        eventId: "evt-1",
        buyer: null,
        buyerEmail: "magda@example.com",
        grossAmount: 1000,
        ownerNetPayout: 900,
        platformFee: 50,
        stripeFees: 50,
        stripeTaxFee: 0,
        refundStatus: "NONE",
        payoutStatus: "ESCROW",
        currency: "EUR",
        eligibleForPayoutAt: null,
        scheduledPayoutAt: null,
        paidOutAt: null,
        transaction: { id: `txn-${id}`, status: "COMPLETED", totalAmount: 1000, currency: "EUR" },
    };
}

const event = {
    id: "evt-1",
    slug: "evt-1",
    requiresApproval: false,
    price: 1000,
    currency: "EUR",
    refundPolicy: null,
    attendees: [
        {
            id: "att-own",
            userId: null,
            status: "APPROVED",
            name: "Magda",
            email: "magda@example.com",
            saleId: "sale-own",
            tier: { id: "tier-1", name: "Standard" },
        },
        {
            id: "att-companion",
            userId: null,
            status: "APPROVED",
            name: "Eyal",
            email: null,
            companion: true,
            purchaserEmail: "magda@example.com",
            saleId: "sale-companion",
            tier: { id: "tier-1", name: "Standard" },
        },
    ],
};

describe("AttendeesAndInvitationsSection: companion place", () => {
    it("shows the companion's name and buyer, and does not call it Complimentary", async () => {
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, body: { sales: [sale("sale-own"), sale("sale-companion")] } },
        ]);
        renderWithConfig(
            <AttendeesAndInvitationsSection event={event} communityTag="c" isPublished={true} isPast={false} />,
        );
        await waitFor(() => expect(screen.getByText("Eyal")).toBeInTheDocument());
        expect(screen.getByText(/Bought by magda@example\.com/)).toBeInTheDocument();
        await waitFor(() => expect(screen.queryAllByText(/Complimentary/)).toHaveLength(0));
    });
});
