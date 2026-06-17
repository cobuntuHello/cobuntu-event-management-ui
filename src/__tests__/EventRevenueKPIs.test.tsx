import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { EventRevenueKPIs } from "../components/EventRevenueKPIs";
import { renderWithConfig, mockFetch } from "./test-utils";

const paidEvent = (id = "evt-1", currency = "EUR") => ({
    id,
    price: 2000,
    currency,
});

const sale = (overrides: Record<string, unknown> = {}) => ({
    id: "sale-1",
    eventId: "evt-1",
    grossAmount: 2000,
    ownerNetPayout: 1700,
    platformFee: 200,
    stripeFees: 80,
    stripeTaxFee: 20,
    refundStatus: "NONE",
    ...overrides,
});

describe("EventRevenueKPIs — visibility", () => {
    it("renders nothing for free events", () => {
        const { container } = renderWithConfig(
            <EventRevenueKPIs event={{ id: "evt-1", price: 0 }} communityTag="pbn" />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing while paid+zero-sales (after fetch resolves empty)", async () => {
        mockFetch([{ method: "GET", url: "/api/communities/pbn/sales?timeRange=1y", body: { sales: [] } }]);
        const { container } = renderWithConfig(
            <EventRevenueKPIs event={paidEvent()} communityTag="pbn" />,
        );
        await waitFor(() => {
            expect(container).toBeEmptyDOMElement();
        });
    });

    it("filters sales to the event and excludes refunded rows", async () => {
        mockFetch([
            {
                method: "GET",
                url: "/api/communities/pbn/sales?timeRange=1y",
                body: {
                    sales: [
                        sale({ id: "a" }),
                        sale({ id: "b" }),
                        // Refunded — should be excluded.
                        sale({ id: "c", refundStatus: "FULL" }),
                        // Different event — should be excluded.
                        sale({ id: "d", eventId: "evt-other" }),
                    ],
                },
            },
        ]);
        renderWithConfig(<EventRevenueKPIs event={paidEvent()} communityTag="pbn" />);
        await waitFor(() => {
            expect(screen.getByText("Paid attendees")).toBeInTheDocument();
        });
        // Two valid rows → 2 paid attendees.
        expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("dedupes by id (sales-list emits the same row under uid:* and em:* keys)", async () => {
        mockFetch([
            {
                method: "GET",
                url: "/api/communities/pbn/sales?timeRange=1y",
                body: {
                    sales: [
                        sale({ id: "a" }),
                        sale({ id: "a" }),
                        sale({ id: "b" }),
                    ],
                },
            },
        ]);
        renderWithConfig(<EventRevenueKPIs event={paidEvent()} communityTag="pbn" />);
        await waitFor(() => {
            expect(screen.getByText("Paid attendees")).toBeInTheDocument();
        });
        expect(screen.getByText("2")).toBeInTheDocument();
    });
});

describe("EventRevenueKPIs — totals", () => {
    it("sums revenue / fees / net and formats in EUR", async () => {
        mockFetch([
            {
                method: "GET",
                url: "/api/communities/pbn/sales?timeRange=1y",
                body: { sales: [sale({ id: "a" }), sale({ id: "b" })] },
            },
        ]);
        renderWithConfig(<EventRevenueKPIs event={paidEvent()} communityTag="pbn" />);
        await waitFor(() => expect(screen.getByText("Revenue")).toBeInTheDocument());
        // 2 × €20.00 = €40.00 revenue
        expect(screen.getByText(/€40\.00/)).toBeInTheDocument();
        // Fees: 2 × (200 + 80 + 20) = 600 cents = €6.00
        expect(screen.getByText(/€6\.00/)).toBeInTheDocument();
        // Net: 2 × 1700 = €34.00
        expect(screen.getByText(/€34\.00/)).toBeInTheDocument();
    });

    it("renders gracefully when stripeFees/stripeTaxFee are missing", async () => {
        mockFetch([
            {
                method: "GET",
                url: "/api/communities/pbn/sales?timeRange=1y",
                body: {
                    sales: [
                        sale({ id: "a", stripeFees: null, stripeTaxFee: null }),
                    ],
                },
            },
        ]);
        renderWithConfig(<EventRevenueKPIs event={paidEvent()} communityTag="pbn" />);
        await waitFor(() => expect(screen.getByText("Fees paid")).toBeInTheDocument());
        // Fees: just the platform fee = €2.00
        expect(screen.getByText(/€2\.00/)).toBeInTheDocument();
    });
});
