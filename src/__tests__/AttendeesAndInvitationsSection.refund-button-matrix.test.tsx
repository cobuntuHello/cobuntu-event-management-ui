/**
 * Refund-button matrix tests for AttendeesAndInvitationsSection.
 *
 * Verifies the (event.refundPolicy.mode × sale.payoutStatus) decision
 * shipped 2026-06-18 with feat/configurable-event-refund-policy. The
 * row in the Registered tab decides between four affordances:
 *
 *   enabled            → opens RefundSaleModal
 *   disabled-policy    → "Refund window closed" pill (cursor-help)
 *   disabled-paid-out  → "Paid out · Refund from Stripe" link (opens
 *                         the host's Stripe dashboard in a new tab)
 *   hidden             → no button rendered (free / comped attendees,
 *                         BLOCKED sales)
 *
 * NULL refundPolicy is treated as 'default' so events that haven't
 * opted in keep today's behaviour.
 */

import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { AttendeesAndInvitationsSection } from "../components/AttendeesAndInvitationsSection";
import { renderWithConfig, mockFetch } from "./test-utils";

const emptyStatsRoute = { url: "/invitations/stats", body: { totalInvited: 0, accepted: 0, pending: 0, expired: 0, cancelled: 0, byInviter: [] } };
const emptyInvitationsRoute = { url: "/invitations", body: { invitations: [] } };

function baseEvent(over: Partial<any> = {}) {
    return {
        id: "evt-1",
        slug: "evt-1",
        requiresApproval: false,
        price: 2500,
        currency: "EUR",
        attendees: [
            {
                id: "att-1",
                userId: "u-buyer",
                status: "APPROVED",
                name: "Ana Buyer",
                email: "ana@example.com",
                user: { id: "u-buyer", name: "Ana Buyer", usertag: "ana", email: "ana@example.com" },
                tier: { id: "tier-1", name: "Standard" },
            },
        ],
        refundPolicy: null,
        ...over,
    };
}

function saleFor(payoutStatus: "ESCROW" | "ELIGIBLE" | "PAID" | "BLOCKED") {
    return {
        id: "sale-1",
        createdAt: "2026-06-17T10:00:00.000Z",
        eventId: "evt-1",
        buyer: { id: "u-buyer", name: "Ana Buyer", usertag: "ana" },
        buyerEmail: "ana@example.com",
        grossAmount: 2500,
        ownerNetPayout: 2200,
        platformFee: 100,
        stripeFees: 200,
        stripeTaxFee: 0,
        refundStatus: "NONE",
        payoutStatus,
        currency: "EUR",
        eligibleForPayoutAt: null,
        scheduledPayoutAt: null,
        paidOutAt: null,
        transaction: { id: "txn-1", status: "COMPLETED", totalAmount: 2500, currency: "EUR" },
    };
}

describe("AttendeesAndInvitationsSection — refund-button matrix", () => {
    it("ESCROW (any mode) → Refund button enabled", async () => {
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, body: { sales: [saleFor("ESCROW")] } },
        ]);
        renderWithConfig(
            <AttendeesAndInvitationsSection
                event={baseEvent()}
                communityTag="c"
                isPublished={true}
                isPast={false}
            />,
        );
        await waitFor(() => expect(screen.getByRole("button", { name: /^Refund$/ })).toBeEnabled());
    });

    it("default + ELIGIBLE → disabled 'Refund window closed' pill (no Refund button)", async () => {
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, body: { sales: [saleFor("ELIGIBLE")] } },
        ]);
        renderWithConfig(
            <AttendeesAndInvitationsSection
                event={baseEvent()}
                communityTag="c"
                isPublished={true}
                isPast={false}
            />,
        );
        await waitFor(() => expect(screen.getByText(/Refund window closed/)).toBeInTheDocument());
        expect(screen.queryByRole("button", { name: /^Refund$/ })).not.toBeInTheDocument();
        expect(screen.queryByText(/Paid out/)).not.toBeInTheDocument();
    });

    it("extended + ELIGIBLE → Refund button ENABLED (the new capability)", async () => {
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, body: { sales: [saleFor("ELIGIBLE")] } },
        ]);
        renderWithConfig(
            <AttendeesAndInvitationsSection
                event={baseEvent({ refundPolicy: { mode: "extended", updatedAt: "", updatedByUserId: null } })}
                communityTag="c"
                isPublished={true}
                isPast={false}
            />,
        );
        await waitFor(() => expect(screen.getByRole("button", { name: /^Refund$/ })).toBeEnabled());
        expect(screen.queryByText(/Refund window closed/)).not.toBeInTheDocument();
    });

    it("PAID (any mode) → Stripe-dashboard handoff link (new tab)", async () => {
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, body: { sales: [saleFor("PAID")] } },
        ]);
        renderWithConfig(
            <AttendeesAndInvitationsSection
                event={baseEvent({ refundPolicy: { mode: "extended", updatedAt: "", updatedByUserId: null } })}
                communityTag="c"
                isPublished={true}
                isPast={false}
            />,
        );
        const link = await screen.findByRole("link", { name: /Paid out · Refund from Stripe/ });
        expect(link).toHaveAttribute("href", "https://dashboard.stripe.com/payments");
        expect(link).toHaveAttribute("target", "_blank");
        expect(screen.queryByRole("button", { name: /^Refund$/ })).not.toBeInTheDocument();
    });

    it("NULL refundPolicy is treated as 'default' (ELIGIBLE blocked)", async () => {
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, body: { sales: [saleFor("ELIGIBLE")] } },
        ]);
        renderWithConfig(
            <AttendeesAndInvitationsSection
                event={baseEvent({ refundPolicy: null })}
                communityTag="c"
                isPublished={true}
                isPast={false}
            />,
        );
        await waitFor(() => expect(screen.getByText(/Refund window closed/)).toBeInTheDocument());
    });
});
