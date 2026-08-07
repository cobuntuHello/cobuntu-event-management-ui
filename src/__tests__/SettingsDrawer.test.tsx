import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsDrawer } from "../components/SettingsDrawer";
import { renderWithConfig } from "./test-utils";

// NOTE: the Membership-funnel row was removed alongside the BE module kill
// in cobuntu-backend-monorepo PR #671 (Phase 3 PR 13a of the events-domain
// architecture refactor umbrella). The feature will be rebuilt as pure-FE
// later — Workstream 1 in the events-domain roadmap.
const baseEvent = (overrides: Record<string, unknown> = {}) => ({
    id: "evt-1",
    slug: "lisbon-meetup",
    viewability: "PUBLIC",
    accessibility: "PUBLIC",
    detailSource: "NATIVE",
    externalDetailUrl: null,
    featured: false,
    refundPolicy: null,
    ...overrides,
});

const baseProps = (overrides: Record<string, unknown> = {}) => ({
    event: baseEvent(),
    communityTag: "pbn",
    isOpen: true,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    showToast: vi.fn(),
    ...overrides,
});

describe("SettingsDrawer — visibility", () => {
    it("does not render when isOpen=false", () => {
        renderWithConfig(<SettingsDrawer {...baseProps({ isOpen: false })} />);
        expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    });

    it("renders the heading + the settings rows when isOpen=true", () => {
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        expect(screen.getByText("Settings")).toBeInTheDocument();
        expect(screen.getByText("Visibility")).toBeInTheDocument();
        expect(screen.getByText("Access")).toBeInTheDocument();
        expect(screen.getByText("Distribution")).toBeInTheDocument();
        // After-checkout config row (feat/purchase-flow-upsell). Reclaims the
        // slot the removed Membership funnel row occupied.
        expect(screen.getByText("After checkout")).toBeInTheDocument();
        expect(screen.getByText("Refund policy")).toBeInTheDocument();
        // Membership funnel row removed in PR 13a — assert it stays gone.
        expect(screen.queryByText("Membership funnel")).not.toBeInTheDocument();
    });
});

describe("SettingsDrawer — summaries reflect event state", () => {
    it("Visibility = Public when viewability=PUBLIC", () => {
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        const row = screen.getByText("Visibility").closest("button");
        expect(row).toHaveTextContent(/Public/);
    });

    it("Visibility = Members only when viewability=MEMBERS_ONLY", () => {
        renderWithConfig(
            <SettingsDrawer {...baseProps({ event: baseEvent({ viewability: "MEMBERS_ONLY" }) })} />,
        );
        const row = screen.getByText("Visibility").closest("button");
        expect(row).toHaveTextContent(/Members only/);
    });

    it("Distribution = Cobuntu event page (no Featured) by default", () => {
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        const row = screen.getByText("Distribution").closest("button");
        expect(row).toHaveTextContent(/Cobuntu event page/);
        expect(row).not.toHaveTextContent(/Featured/);
    });

    it("Distribution = Custom landing page · Featured when both set", () => {
        renderWithConfig(
            <SettingsDrawer
                {...baseProps({
                    event: baseEvent({
                        detailSource: "EXTERNAL",
                        externalDetailUrl: "https://x.example.com",
                        featured: true,
                    }),
                })}
            />,
        );
        const row = screen.getByText("Distribution").closest("button");
        expect(row).toHaveTextContent(/Custom landing page/);
        expect(row).toHaveTextContent(/Featured/);
    });
});

describe("SettingsDrawer — past-event note", () => {
    it("hides the past-event note by default", () => {
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        expect(screen.queryByText(/event has ended/i)).not.toBeInTheDocument();
    });

    it("renders the past-event note when isPast=true and keeps the remaining rows clickable", () => {
        renderWithConfig(<SettingsDrawer {...baseProps({ isPast: true })} />);
        expect(screen.getByText(/event has ended/i)).toBeInTheDocument();
        expect(screen.getByText("Visibility")).toBeInTheDocument();
        expect(screen.getByText("Access")).toBeInTheDocument();
        expect(screen.getByText("Distribution")).toBeInTheDocument();
        expect(screen.getByText("Refund policy")).toBeInTheDocument();
    });
});

describe("SettingsDrawer — close + row → sub-modal", () => {
    it("Close icon eventually fires onClose", async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        renderWithConfig(<SettingsDrawer {...baseProps({ onClose })} />);
        await user.click(screen.getByLabelText("Close settings"));
        await new Promise((r) => setTimeout(r, 350));
        expect(onClose).toHaveBeenCalled();
    });

    it("clicking the Distribution row swaps the drawer for the DistributionEditModal", async () => {
        const user = userEvent.setup();
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        await user.click(screen.getByText("Distribution").closest("button")!);
        await new Promise((r) => setTimeout(r, 350));
        expect(
            screen.getByText(/where members land when they click this event/i),
        ).toBeInTheDocument();
    });

    it("clicking the Visibility row swaps the drawer for the ViewabilityEditModal", async () => {
        const user = userEvent.setup();
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        await user.click(screen.getByText("Visibility").closest("button")!);
        await new Promise((r) => setTimeout(r, 350));
        const headings = screen.getAllByRole("heading");
        const found = headings.find((h) => /visibility/i.test(h.textContent || ""));
        expect(found).toBeTruthy();
    });
});

/**
 * `hideAfterCheckout` — the after-checkout config (post-purchase membership
 * upsell / external redirect) is a community-LEADER capability. The backend
 * requires the event to be community-owned AND the caller to hold
 * EVENTS_CREATE, so a member host of their own event gets a 403 on save.
 *
 * Before this prop the row rendered for anyone with manage access, and a
 * member host who used it hit a dead-end error. Mirrors EventForm's
 * `hideVisibility`: the affordance is hidden, the route stays the guard.
 */
describe("SettingsDrawer — hideAfterCheckout gating", () => {
    it("shows the After checkout row by default (leader view)", () => {
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        expect(screen.getByText("After checkout")).toBeInTheDocument();
    });

    it("hides the After checkout row when hideAfterCheckout, keeping every other row", () => {
        renderWithConfig(<SettingsDrawer {...baseProps({ hideAfterCheckout: true })} />);
        expect(screen.queryByText("After checkout")).not.toBeInTheDocument();
        expect(screen.getByText("Visibility")).toBeInTheDocument();
        expect(screen.getByText("Access")).toBeInTheDocument();
        expect(screen.getByText("Distribution")).toBeInTheDocument();
        expect(screen.getByText("Refund policy")).toBeInTheDocument();
    });

    it("still hides the row when the event already has a saved config", () => {
        renderWithConfig(
            <SettingsDrawer
                {...baseProps({
                    event: baseEvent({ afterCheckoutMode: "EXTERNAL", postCheckoutUrl: "https://acme.test/thanks" }),
                    hideAfterCheckout: true,
                })}
            />,
        );
        expect(screen.queryByText("After checkout")).not.toBeInTheDocument();
        expect(screen.queryByText("External redirect")).not.toBeInTheDocument();
    });

    it("summarises a saved EXTERNAL config for a leader (the read-shape regression)", () => {
        renderWithConfig(
            <SettingsDrawer
                {...baseProps({
                    event: baseEvent({ afterCheckoutMode: "EXTERNAL", postCheckoutUrl: "https://acme.test/thanks" }),
                })}
            />,
        );
        const row = screen.getByText("After checkout").closest("button");
        expect(row).toHaveTextContent(/External redirect/);
    });

    it("summarises a saved MEMBERSHIP_UPSELL config for a leader", () => {
        renderWithConfig(
            <SettingsDrawer
                {...baseProps({ event: baseEvent({ afterCheckoutMode: "MEMBERSHIP_UPSELL" }) })}
            />,
        );
        const row = screen.getByText("After checkout").closest("button");
        expect(row).toHaveTextContent(/Membership upsell/);
    });
});
