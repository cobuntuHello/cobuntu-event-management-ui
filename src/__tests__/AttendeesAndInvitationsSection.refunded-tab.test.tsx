/**
 * Tests for the "Refunded" tab on AttendeesAndInvitationsSection.
 *
 * The tab is the host-facing audit view for refunded sales tied to
 * an event. It only appears when at least one refunded sale exists,
 * renders each refunded sale as a single row (buyer + amount + date
 * + reason + credit-note link), and reuses the SaleRow shape returned
 * by GET /communities/:tag/sales (with the new optional refund +
 * creditNote fields).
 *
 * Coverage:
 *  1. Tab is hidden when there are no refunded sales.
 *  2. Tab appears + opens a list with buyer + amount + reason.
 *  3. Credit-note link uses stripeHostedUrl (rotates-safe).
 *  4. "Credit note pending" pill renders when the cascade hasn't
 *     created the invoice yet.
 */

import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendeesAndInvitationsSection } from "../components/AttendeesAndInvitationsSection";
import { renderWithConfig, mockFetch } from "./test-utils";

const baseEvent = {
    id: "evt-1",
    slug: "evt-1",
    requiresApproval: false,
    price: 2500,
    currency: "EUR",
    attendees: [],
};

const emptyStatsRoute = { url: "/invitations/stats", body: { totalInvited: 0, accepted: 0, pending: 0, expired: 0, cancelled: 0, byInviter: [] } };
const emptyInvitationsRoute = { url: "/invitations", body: { invitations: [] } };

function refundedSale(over: Partial<any> = {}) {
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
        refundStatus: "FULL",
        payoutStatus: "ESCROW",
        currency: "EUR",
        eligibleForPayoutAt: null,
        scheduledPayoutAt: null,
        paidOutAt: null,
        transaction: { id: "txn-1", status: "COMPLETED", totalAmount: 2500, currency: "EUR" },
        refund: {
            id: "rf-1",
            createdAt: "2026-06-17T11:00:00.000Z",
            amount: 2500,
            reason: "host_requested",
        },
        creditNote: {
            id: "cn-1",
            stripeInvoicePdf: "https://pdf.test/cn.pdf",
            stripeHostedUrl: "https://invoice.stripe.com/cn",
        },
        ...over,
    };
}

describe("AttendeesAndInvitationsSection — Refunded tab", () => {
    it("does not render the Refunded tab when no refunded sales exist", async () => {
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, body: { sales: [] } },
        ]);
        renderWithConfig(
            <AttendeesAndInvitationsSection
                event={baseEvent}
                communityTag="c"
                isPublished={true}
                isPast={false}
            />,
        );
        await waitFor(() => {
            expect(screen.getByText(/Attendees \(0\)/)).toBeInTheDocument();
        });
        expect(screen.queryByRole("button", { name: /Refunded/ })).not.toBeInTheDocument();
    });

    it("renders the Refunded tab + a row with buyer, amount, reason, and credit-note link", async () => {
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, body: { sales: [refundedSale()] } },
        ]);
        renderWithConfig(
            <AttendeesAndInvitationsSection
                event={baseEvent}
                communityTag="c"
                isPublished={true}
                isPast={false}
            />,
        );
        const refundedTab = await screen.findByRole("button", { name: /Refunded/ });
        await userEvent.click(refundedTab);
        expect(await screen.findByText("Ana Buyer")).toBeInTheDocument();
        expect(screen.getByText("€ 25.00")).toBeInTheDocument();
        expect(screen.getByText(/Reason: host_requested/)).toBeInTheDocument();
        const creditNoteLink = screen.getByRole("link", { name: /Credit note/ });
        expect(creditNoteLink).toHaveAttribute("href", "https://invoice.stripe.com/cn");
        expect(creditNoteLink).toHaveAttribute("target", "_blank");
    });

    it("renders a 'Credit note pending' pill when the invoice hasn't been created yet", async () => {
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, body: { sales: [refundedSale({ creditNote: null })] } },
        ]);
        renderWithConfig(
            <AttendeesAndInvitationsSection
                event={baseEvent}
                communityTag="c"
                isPublished={true}
                isPast={false}
            />,
        );
        const refundedTab = await screen.findByRole("button", { name: /Refunded/ });
        await userEvent.click(refundedTab);
        expect(await screen.findByText("Credit note pending")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /Credit note/ })).not.toBeInTheDocument();
    });

    it("falls back to buyerEmail when buyer.name is missing (guest checkout)", async () => {
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, body: { sales: [refundedSale({ buyer: { id: "", name: null, usertag: null }, buyerEmail: "guest@x.test" })] } },
        ]);
        renderWithConfig(
            <AttendeesAndInvitationsSection
                event={baseEvent}
                communityTag="c"
                isPublished={true}
                isPast={false}
            />,
        );
        const refundedTab = await screen.findByRole("button", { name: /Refunded/ });
        await userEvent.click(refundedTab);
        // Guest checkout: buyer.name is null, so the row's primary
        // label falls back to buyerEmail. The email also shows in the
        // subtitle (when both buyer.name and an email exist they don't
        // duplicate). Use findAllByText since both surfaces match.
        const hits = await screen.findAllByText("guest@x.test");
        expect(hits.length).toBeGreaterThanOrEqual(1);
    });

    it("renders the 'Policy override' line when refund.bypassReason is present", async () => {
        // Post feat/sales-include-bypass-reason (2026-06-18): refunds
        // issued past the standard window under extended-mode policy
        // carry a bypassReason. The Refunded tab surfaces it as a
        // distinct line so hosts can audit which refunds used the
        // override at a glance.
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, body: { sales: [refundedSale({ refund: { id: "rf-1", createdAt: "2026-06-17T11:00:00.000Z", amount: 2500, reason: "host_requested", bypassReason: "No-show; goodwill refund day after" } })] } },
        ]);
        renderWithConfig(
            <AttendeesAndInvitationsSection
                event={baseEvent}
                communityTag="c"
                isPublished={true}
                isPast={false}
            />,
        );
        const refundedTab = await screen.findByRole("button", { name: /Refunded/ });
        await userEvent.click(refundedTab);
        expect(
            await screen.findByText(/Policy override: No-show; goodwill refund day after/),
        ).toBeInTheDocument();
    });

    it("does NOT render a 'Policy override' line on a standard refund (bypassReason null)", async () => {
        mockFetch([
            emptyStatsRoute,
            emptyInvitationsRoute,
            { url: /\/sales/, body: { sales: [refundedSale()] } },
        ]);
        renderWithConfig(
            <AttendeesAndInvitationsSection
                event={baseEvent}
                communityTag="c"
                isPublished={true}
                isPast={false}
            />,
        );
        const refundedTab = await screen.findByRole("button", { name: /Refunded/ });
        await userEvent.click(refundedTab);
        await screen.findByText("Ana Buyer");
        expect(screen.queryByText(/Policy override/)).not.toBeInTheDocument();
    });
});
