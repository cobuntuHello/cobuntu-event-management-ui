/**
 * The per-event refund-policy edit modal, simplified (T-234) to the two presets
 * hosts asked for — Standard vs No self-service refunds — using the SAME
 * RefundPolicyField the create wizard shows. Saves via useUpdateEvent (PUT).
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

const standardOpt = () => screen.getByRole("button", { name: /Standard refunds/i });
const noneOpt = () => screen.getByRole("button", { name: /No self-service refunds/i });

describe("RefundPolicyEditModal — rendering + hydration", () => {
    it("renders both presets, Standard selected for an event without a policy", () => {
        renderWithConfig(<RefundPolicyEditModal {...baseProps()} />);
        expect(screen.getByText("Refund policy")).toBeInTheDocument();
        expect(standardOpt()).toHaveAttribute("aria-pressed", "true");
        expect(noneOpt()).toHaveAttribute("aria-pressed", "false");
    });

    it("hydrates No self-service refunds when customBuyerWindowDays=0", () => {
        renderWithConfig(
            <RefundPolicyEditModal
                {...baseProps({ event: baseEvent({ refundPolicy: { mode: "default", customBuyerWindowDays: 0 } }) })}
            />,
        );
        expect(noneOpt()).toHaveAttribute("aria-pressed", "true");
    });
});

describe("RefundPolicyEditModal — save", () => {
    it("PUTs refundPolicy: null for Standard", async () => {
        const user = userEvent.setup();
        const onSaved = vi.fn();
        const showToast = vi.fn();
        const fetchMock = mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", body: { event: baseEvent() } },
        ]);
        renderWithConfig(
            <RefundPolicyEditModal
                {...baseProps({ onSaved, showToast, event: baseEvent({ refundPolicy: { mode: "default", customBuyerWindowDays: 0 } }) })}
            />,
        );
        await user.click(standardOpt());
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(showToast).toHaveBeenCalledWith("Refund policy updated");
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).refundPolicy).toBeNull();
    });

    it("PUTs customBuyerWindowDays=0 for No self-service refunds", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", body: { event: baseEvent() } },
        ]);
        renderWithConfig(<RefundPolicyEditModal {...baseProps()} />);
        await user.click(noneOpt());
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).refundPolicy).toEqual({ mode: "default", customBuyerWindowDays: 0 });
    });

    it("surfaces server error via showToast when the PUT 4xxs", async () => {
        const user = userEvent.setup();
        const showToast = vi.fn();
        mockFetch([
            { method: "PUT", url: "/api/communities/pbn/events/evt-1", status: 400, body: { error: "refundPolicy is invalid" } },
        ]);
        renderWithConfig(<RefundPolicyEditModal {...baseProps({ showToast })} />);
        await user.click(noneOpt());
        await user.click(screen.getByRole("button", { name: /save/i }));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/invalid/i)));
    });
});

describe("refundPolicySummary helper", () => {
    it("is Standard refunds for a null policy", () => {
        expect(refundPolicySummary(null)).toBe("Standard refunds");
    });
    it("is No self-service refunds for window=0", () => {
        expect(refundPolicySummary({ mode: "default", customBuyerWindowDays: 0 })).toBe("No self-service refunds");
    });
    it("is Standard refunds for any positive/absent window and malformed input", () => {
        expect(refundPolicySummary({ mode: "extended", customBuyerWindowDays: 14 })).toBe("Standard refunds");
        expect(refundPolicySummary("garbage" as any)).toBe("Standard refunds");
    });
});
