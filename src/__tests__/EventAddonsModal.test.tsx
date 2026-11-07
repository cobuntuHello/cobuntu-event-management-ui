import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventAddonsModal } from "../components/EventAddonsModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * feat/event-addon-charging — the modal's three real states: nothing picked
 * yet, a selection to pay for, and a selection that's already paid and
 * locked. The assertion that matters in each: the PUT body carries exactly
 * the chosen addonIds (never a client-trusted price), checkout only offers
 * once a selection exists, and a PAID selection can't be toggled at all.
 */

const OFFERS = {
    method: "GET",
    url: /\/my-addons\?contentType=EVENT/,
    body: {
        addons: [
            { id: "a-security", name: "Security", description: "Required over 200 people.", priceCents: 20000, sortOrder: 1 },
            { id: "a-sound", name: "Sound engineer", description: "Sets up and runs the sound.", priceCents: 12000, sortOrder: 2 },
        ],
    },
};

function open(selections: any[] = []) {
    const onClose = vi.fn();
    const fetchMock = mockFetch([
        OFFERS,
        { method: "GET", url: /\/events\/evt-1\/addons$/, body: { selections, totalCents: 0, unpaidCents: 0 } },
        {
            method: "PUT",
            url: /\/events\/evt-1\/addons$/,
            bodyFn: (init) => {
                const sent = JSON.parse((init?.body as string) || "{}");
                return {
                    selections: sent.addonIds.map((id: string) => {
                        const a = OFFERS.body.addons.find((x) => x.id === id)!;
                        return { id: `sel-${id}`, addonId: id, name: a.name, description: a.description, priceCents: a.priceCents, currency: "EUR", status: "PENDING", paidAt: null };
                    }),
                };
            },
        },
        { method: "POST", url: /\/events\/evt-1\/addons\/checkout$/, body: { checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_mock", sessionId: "cs_test_mock", totalAmountCents: 20000 } },
    ]);
    renderWithConfig(
        <EventAddonsModal event={{ id: "evt-1", name: "Summer Party" }} communityTag="teja" onClose={onClose} />,
    );
    return { onClose, fetchMock };
}

describe("EventAddonsModal", () => {
    it("saves exactly the toggled addonIds, never a client-supplied price", async () => {
        const { fetchMock } = open();
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByText("Security")).toBeInTheDocument());
        await user.click(screen.getByText("Security"));
        await user.click(screen.getByText("Save selection"));

        await waitFor(() => {
            const call = fetchMock.mock.calls.find(([url, init]: any) => String(url).includes("/addons") && init?.method === "PUT");
            expect(call).toBeTruthy();
            const body = JSON.parse((call![1] as RequestInit).body as string);
            expect(body).toEqual({ addonIds: ["a-security"] });
        });
    });

    it("offers checkout once a selection exists, and forwards to the real checkout URL", async () => {
        open([
            { id: "sel-1", addonId: "a-security", name: "Security", description: null, priceCents: 20000, currency: "EUR", status: "PENDING", paidAt: null },
        ]);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByText(/Pay .* now/)).toBeInTheDocument());
        await user.click(screen.getByText(/Pay .* now/));

        await waitFor(() => expect(screen.getByText("https://checkout.stripe.com/c/pay/cs_test_mock")).toBeInTheDocument());
    });

    it("locks every toggle once any selection is PAID", async () => {
        open([
            { id: "sel-1", addonId: "a-security", name: "Security", description: null, priceCents: 20000, currency: "EUR", status: "PAID", paidAt: "2026-11-07T00:00:00.000Z" },
        ]);

        await waitFor(() => expect(screen.getByText("Add-ons paid")).toBeInTheDocument());
        expect(screen.getByText("Security").closest("button")).toBeDisabled();
        expect(screen.queryByText("Save selection")).not.toBeInTheDocument();
        expect(screen.queryByText(/Pay .* now/)).not.toBeInTheDocument();
    });
});
