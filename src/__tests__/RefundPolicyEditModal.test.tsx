/**
 * Tests for the per-event refund-policy edit modal.
 *
 * Pinned (payout reform — customBuyerWindowDays is on/off only now):
 *   - Renders mode radios + a buyer self-service toggle (on/off)
 *   - Hydrates from event.refundPolicy
 *   - Defaults (NULL policy) → "default" mode + buyer self-service ON
 *   - > 0 means "buyers self-refund until the event ends"; 0 = off
 *   - Save PUTs the canonical `{ mode, customBuyerWindowDays }` shape
 *     (enabling sends a positive value, off sends 0)
 *   - Stripe-dashboard handoff helper text rendered
 *   - refundPolicySummary() helper renders human copy for all states
 */

import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefundPolicyEditModal, refundPolicySummary } from "../components/RefundPolicyEditModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const baseEvent = (overrides: Record<string, unknown> = {}) => ({
    id: "evt-1",
    slug: "lisbon-meetup",
    refundPolicy: null,
    ...overrides,
});

const baseProps = (overrides: Record<string, unknown> = {}) => ({
    event: baseEvent(),
    communityTag: "pbn",
    onClose: vi.fn(),
    onSaved: vi.fn(),
    showToast: vi.fn(),
    ...overrides,
});

const extendedRadio = () => screen.getByRole("button", { name: /^Extended/ });
const allowedToggle = () => screen.getByRole("button", { name: /Allowed until the event ends/ });
const offToggle = () => screen.getByRole("button", { name: /^Off/ });

describe("RefundPolicyEditModal — rendering + hydration", () => {
    it("renders heading, both modes, and buyer self-service ON for an event without a policy", () => {
        renderWithConfig(<RefundPolicyEditModal {...baseProps()} />);
        expect(screen.getByText("Refund policy")).toBeInTheDocument();
        expect(screen.getByText("Standard")).toBeInTheDocument();
        expect(screen.getByText("Extended")).toBeInTheDocument();
        // NULL policy → buyer self-service defaults ON (selected).
        expect(allowedToggle().className).toMatch(/border-zinc-900/);
    });

    it("hydrates the Extended mode + self-service ON from an existing policy", () => {
        renderWithConfig(
            <RefundPolicyEditModal
                {...baseProps({
                    event: baseEvent({
                        refundPolicy: {
                            mode: "extended",
                            customBuyerWindowDays: 14,
                            updatedAt: "2026-06-17T10:00:00.000Z",
                            updatedByUserId: "u-someone",
                        },
                    }),
                })}
            />,
        );
        expect(allowedToggle().className).toMatch(/border-zinc-900/);
        expect(extendedRadio().className).toMatch(/border-zinc-900/);
    });

    it("renders the Stripe-dashboard handoff helper text", () => {
        renderWithConfig(<RefundPolicyEditModal {...baseProps()} />);
        expect(screen.getByText(/Stripe dashboard/i)).toBeInTheDocument();
        expect(screen.getByText(/Cobuntu does not refund/i)).toBeInTheDocument();
    });

    it("hydrates buyer self-service OFF when customBuyerWindowDays=0", () => {
        renderWithConfig(
            <RefundPolicyEditModal
                {...baseProps({
                    event: baseEvent({
                        refundPolicy: { mode: "default", customBuyerWindowDays: 0 },
                    }),
                })}
            />,
        );
        expect(offToggle().className).toMatch(/border-zinc-900/);
    });
});

describe("RefundPolicyEditModal — save", () => {
    it("PUTs { mode: 'extended', customBuyerWindowDays: 7 } when host enables extended (self-service on by default)", async () => {
        const user = userEvent.setup();
        const onSaved = vi.fn();
        const showToast = vi.fn();
        const fetchMock = mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", body: { event: baseEvent() } },
        ]);
        renderWithConfig(<RefundPolicyEditModal {...baseProps({ onSaved, showToast })} />);
        await user.click(extendedRadio());
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(showToast).toHaveBeenCalledWith("Refund policy updated");
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        // NULL policy + self-service on → default positive sentinel (7).
        expect(body.refundPolicy).toEqual({ mode: "extended", customBuyerWindowDays: 7 });
        // updatedAt + updatedByUserId are server-stamped — never sent.
        expect(body.refundPolicy.updatedAt).toBeUndefined();
        expect(body.refundPolicy.updatedByUserId).toBeUndefined();
    });

    it("PUTs customBuyerWindowDays=0 when buyer self-service is toggled off", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", body: { event: baseEvent() } },
        ]);
        renderWithConfig(<RefundPolicyEditModal {...baseProps()} />);
        await user.click(offToggle());
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.refundPolicy).toEqual({ mode: "default", customBuyerWindowDays: 0 });
    });

    it("preserves an existing positive window value when re-saving with self-service on", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", body: { event: baseEvent() } },
        ]);
        renderWithConfig(
            <RefundPolicyEditModal
                {...baseProps({ event: baseEvent({ refundPolicy: { mode: "extended", customBuyerWindowDays: 14 } }) })}
            />,
        );
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.refundPolicy).toEqual({ mode: "extended", customBuyerWindowDays: 14 });
    });

    it("surfaces server error via showToast when the PUT 4xxs", async () => {
        const user = userEvent.setup();
        const showToast = vi.fn();
        mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", status: 400, body: { error: "refundPolicy is invalid" } },
        ]);
        renderWithConfig(<RefundPolicyEditModal {...baseProps({ showToast })} />);
        await user.click(extendedRadio());
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() =>
            expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/invalid/i)),
        );
    });
});

describe("refundPolicySummary helper", () => {
    it("renders Standard · self-refund until the event ends for null policy", () => {
        expect(refundPolicySummary(null)).toBe("Standard · Buyers self-refund until the event ends");
    });

    it("renders Extended · self-refund until the event ends for an enabled policy", () => {
        expect(refundPolicySummary({ mode: "extended", customBuyerWindowDays: 14 })).toBe(
            "Extended · Buyers self-refund until the event ends",
        );
    });

    it("renders 'Buyer self-service off' for window=0", () => {
        expect(refundPolicySummary({ mode: "default", customBuyerWindowDays: 0 })).toBe(
            "Standard · Buyer self-service off",
        );
    });

    it("falls back to default mode (self-service on) on malformed input", () => {
        expect(refundPolicySummary("garbage" as any)).toBe(
            "Standard · Buyers self-refund until the event ends",
        );
        expect(refundPolicySummary({ mode: "any_time" } as any)).toBe(
            "Standard · Buyers self-refund until the event ends",
        );
    });
});
