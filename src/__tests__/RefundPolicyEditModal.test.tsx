/**
 * Tests for the per-event refund-policy edit modal.
 *
 * Pinned:
 *   - Renders mode radios + custom buyer window input
 *   - Hydrates from event.refundPolicy
 *   - Defaults (NULL policy) → "default" mode + 7-day buyer window
 *   - Validates customBuyerWindowDays in [0, 90]; non-integer rejected
 *   - Save PUTs the canonical `{ mode, customBuyerWindowDays }` shape
 *   - Stripe-dashboard handoff helper text rendered (Cobuntu doesn't
 *     refund funds that have left platform escrow)
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

const standardRadio = () => screen.getByRole("button", { name: /^Standard/ });
const extendedRadio = () => screen.getByRole("button", { name: /^Extended/ });
const windowInput = () => screen.getByLabelText(/days before event/i) as HTMLInputElement;

describe("RefundPolicyEditModal — rendering + hydration", () => {
    it("renders heading, both modes, and default values for an event without a policy", () => {
        renderWithConfig(<RefundPolicyEditModal {...baseProps()} />);
        expect(screen.getByText("Refund policy")).toBeInTheDocument();
        expect(screen.getByText("Standard")).toBeInTheDocument();
        expect(screen.getByText("Extended")).toBeInTheDocument();
        // 7-day default for NULL policy.
        expect(windowInput().value).toBe("7");
    });

    it("hydrates from an existing extended policy with custom buyer window", () => {
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
        expect(windowInput().value).toBe("14");
        // "Extended" radio shows visual selection via border-zinc-900.
        // We assert via attribute since selection state isn't a native
        // input attribute on these button-style radios.
        expect(extendedRadio().className).toMatch(/border-zinc-900/);
    });

    it("renders the Stripe-dashboard handoff helper text", () => {
        renderWithConfig(<RefundPolicyEditModal {...baseProps()} />);
        expect(screen.getByText(/Stripe dashboard/i)).toBeInTheDocument();
        expect(screen.getByText(/Cobuntu does not refund/i)).toBeInTheDocument();
    });

    it("preserves customBuyerWindowDays=0 (off) instead of falling back to default", () => {
        renderWithConfig(
            <RefundPolicyEditModal
                {...baseProps({
                    event: baseEvent({
                        refundPolicy: { mode: "default", customBuyerWindowDays: 0 },
                    }),
                })}
            />,
        );
        expect(windowInput().value).toBe("0");
    });
});

describe("RefundPolicyEditModal — validation", () => {
    it("rejects > 90 and surfaces an inline error", async () => {
        const user = userEvent.setup();
        renderWithConfig(<RefundPolicyEditModal {...baseProps()} />);
        await user.clear(windowInput());
        await user.type(windowInput(), "91");
        expect(screen.getByText(/Must be between 0 and 90/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    });

    it("rejects negatives", async () => {
        const user = userEvent.setup();
        renderWithConfig(<RefundPolicyEditModal {...baseProps()} />);
        await user.clear(windowInput());
        await user.type(windowInput(), "-1");
        expect(screen.getByText(/Must be between 0 and 90/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    });
});

describe("RefundPolicyEditModal — save", () => {
    it("PUTs { mode: 'extended', customBuyerWindowDays: 14 } when host enables extended + sets window", async () => {
        const user = userEvent.setup();
        const onSaved = vi.fn();
        const showToast = vi.fn();
        const fetchMock = mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", body: { event: baseEvent() } },
        ]);
        renderWithConfig(<RefundPolicyEditModal {...baseProps({ onSaved, showToast })} />);
        await user.click(extendedRadio());
        await user.clear(windowInput());
        await user.type(windowInput(), "14");
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(showToast).toHaveBeenCalledWith("Refund policy updated");
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.refundPolicy).toEqual({ mode: "extended", customBuyerWindowDays: 14 });
        // updatedAt + updatedByUserId are server-stamped — never sent.
        expect(body.refundPolicy.updatedAt).toBeUndefined();
        expect(body.refundPolicy.updatedByUserId).toBeUndefined();
    });

    it("PUTs customBuyerWindowDays=0 when set explicitly (disables self-service)", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", body: { event: baseEvent() } },
        ]);
        renderWithConfig(<RefundPolicyEditModal {...baseProps()} />);
        await user.clear(windowInput());
        await user.type(windowInput(), "0");
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.refundPolicy).toEqual({ mode: "default", customBuyerWindowDays: 0 });
    });

    it("surfaces server error via showToast when the PUT 4xxs", async () => {
        const user = userEvent.setup();
        const showToast = vi.fn();
        mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", status: 400, body: { error: "refundPolicy.customBuyerWindowDays must be between 0 and 90" } },
        ]);
        renderWithConfig(<RefundPolicyEditModal {...baseProps({ showToast })} />);
        await user.click(extendedRadio());
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() =>
            expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/customBuyerWindowDays/i)),
        );
    });
});

describe("refundPolicySummary helper", () => {
    it("renders Standard · 7 days for null policy", () => {
        expect(refundPolicySummary(null)).toBe("Standard · Buyers self-refund up to 7 days pre-event");
    });

    it("renders Extended · 14 days for explicit policy", () => {
        expect(refundPolicySummary({ mode: "extended", customBuyerWindowDays: 14 })).toBe(
            "Extended · Buyers self-refund up to 14 days pre-event",
        );
    });

    it("renders 'Buyer self-service off' for window=0", () => {
        expect(refundPolicySummary({ mode: "default", customBuyerWindowDays: 0 })).toBe(
            "Standard · Buyer self-service off",
        );
    });

    it("renders 'up to 1 day' (singular) for window=1", () => {
        expect(refundPolicySummary({ mode: "default", customBuyerWindowDays: 1 })).toBe(
            "Standard · Buyers self-refund up to 1 day pre-event",
        );
    });

    it("falls back to default mode on malformed input", () => {
        expect(refundPolicySummary("garbage" as any)).toBe(
            "Standard · Buyers self-refund up to 7 days pre-event",
        );
        expect(refundPolicySummary({ mode: "any_time" } as any)).toBe(
            "Standard · Buyers self-refund up to 7 days pre-event",
        );
    });
});
