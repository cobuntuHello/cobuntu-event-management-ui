/**
 * T-376 (2026-11-22): a host may edit a community-owned event, but the
 * community's own settings (who can see it, who can register, the landing
 * page, after checkout) stay with a leader holding EVENTS_CREATE in the owning
 * community. The event read says so in `viewerCanConfigureCommunity`; an
 * explicit false shows those rows locked with one line saying who can change
 * them, instead of opening editors whose save would 403.
 */
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsDrawer } from "../components/SettingsDrawer";
import { renderWithConfig } from "./test-utils";

const baseEvent = (overrides: Record<string, unknown> = {}) => ({
    id: "evt-1",
    communityId: "com-1",
    slug: "boas-vindas",
    viewability: "PUBLIC",
    accessibility: "PUBLIC",
    detailSource: "NATIVE",
    externalDetailUrl: null,
    featured: false,
    refundPolicy: null,
    ticketProduct: { price: 0 },
    ...overrides,
});
const props = (event: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    event, communityTag: "fsc", isOpen: true, onClose: vi.fn(), onSaved: vi.fn(), showToast: vi.fn(), ...extra,
});

describe("a host who is not a community leader", () => {
    it("sees the community settings locked, with who can change them", () => {
        renderWithConfig(<SettingsDrawer {...props(baseEvent({ viewerCanConfigureCommunity: false }))} />);
        expect(screen.getByTestId("community-settings-locked-note")).toHaveTextContent(
            "Only community leaders with event permissions can change these.",
        );
        for (const label of ["Visibility", "Access", "Distribution", "After checkout"]) {
            const row = screen.getByText(label).closest("[data-locked]");
            expect(row, label).not.toBeNull();
            expect(row!.tagName).toBe("DIV");
        }
    });

    it("cannot open their editors", async () => {
        renderWithConfig(<SettingsDrawer {...props(baseEvent({ viewerCanConfigureCommunity: false }))} />);
        await userEvent.click(screen.getByText("Visibility"));
        // The modal's own heading never appears; the drawer is still what shows.
        expect(screen.getAllByText("Visibility")).toHaveLength(1);
    });

    it("still edits Approval, which is the host's own setting", () => {
        renderWithConfig(<SettingsDrawer {...props(baseEvent({ viewerCanConfigureCommunity: false }))} />);
        expect(screen.getByText("Approval").closest("button")).not.toBeNull();
    });

    it("sees After checkout locked even when the consumer asked to hide it", () => {
        renderWithConfig(<SettingsDrawer {...props(baseEvent({ viewerCanConfigureCommunity: false }), { hideAfterCheckout: true })} />);
        expect(screen.getByText("After checkout").closest("[data-locked]")).not.toBeNull();
    });
});

describe("a leader, or a payload that never said", () => {
    it("explicit true: editable rows, no note", () => {
        renderWithConfig(<SettingsDrawer {...props(baseEvent({ viewerCanConfigureCommunity: true }))} />);
        expect(screen.queryByTestId("community-settings-locked-note")).toBeNull();
        expect(screen.getByText("Visibility").closest("button")).not.toBeNull();
    });

    it("absent: today's behaviour (editable), so an older core never locks a leader out", () => {
        renderWithConfig(<SettingsDrawer {...props(baseEvent())} />);
        expect(screen.queryByTestId("community-settings-locked-note")).toBeNull();
        expect(screen.getByText("Visibility").closest("button")).not.toBeNull();
        expect(screen.getByText("After checkout").closest("button")).not.toBeNull();
    });
});

describe("a personal event", () => {
    it("never shows After checkout (the route refuses it) nor the lock note", () => {
        renderWithConfig(<SettingsDrawer {...props(baseEvent({ communityId: null, viewerCanConfigureCommunity: false }))} />);
        expect(screen.queryByText("After checkout")).toBeNull();
        expect(screen.queryByTestId("community-settings-locked-note")).toBeNull();
    });
});
