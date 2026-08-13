import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsDrawer } from "../components/SettingsDrawer";
import { renderWithConfig } from "./test-utils";

// NOTE: the Membership-funnel row was removed alongside the BE module kill
// in cobuntu-backend-monorepo PR #671 (Phase 3 PR 13a of the events-domain
// architecture refactor umbrella). The feature will be rebuilt as pure-FE
// later — Workstream 1 in the events-domain roadmap.
/*
 * A COMMUNITY-owned event, which is what every test below is about. The
 * community-scoped rows (Visibility, Access, Distribution) only render when
 * this is set — see the personal-event block at the bottom for the other half.
 */
const baseEvent = (overrides: Record<string, unknown> = {}) => ({
    id: "evt-1",
    communityId: "com-1",
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
    it("Visibility = Everyone when viewability=PUBLIC", () => {
        // Copy follows the tier picker now: "Everyone" / "All members" /
        // named tiers, rather than the old Public / Members only pair.
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        const row = screen.getByText("Visibility").closest("button");
        expect(row).toHaveTextContent(/Everyone/);
    });

    it("Visibility = All members when MEMBERS_ONLY with no tier grants", () => {
        // No rows means every tier - the no-backfill rule surfacing in the
        // summary, so an event predating tier access reads correctly.
        renderWithConfig(
            <SettingsDrawer {...baseProps({ event: baseEvent({ viewability: "MEMBERS_ONLY" }) })} />,
        );
        const row = screen.getByText("Visibility").closest("button");
        expect(row).toHaveTextContent(/All members/);
    });

    it("Visibility names the tiers when only some are granted", () => {
        renderWithConfig(
            <SettingsDrawer
                {...baseProps({
                    event: baseEvent({ viewability: "MEMBERS_ONLY" }),
                    membershipTiers: [{ id: "t1", name: "Founding" }, { id: "t2", name: "Alumni" }],
                    viewTierIds: ["t1"],
                })}
            />,
        );
        const row = screen.getByText("Visibility").closest("button");
        expect(row).toHaveTextContent(/Founding/);
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

describe("SettingsDrawer — a personal (user-owned) event", () => {
    /*
     * The Settings button used to be hidden outright on a user-owned event,
     * on the grounds that everything behind it was a statement about a
     * community. That was true of four rows and false of two.
     *
     * Approval and the refund policy are the HOST's own calls — the backend
     * keeps both out of COMMUNITY_SCOPED_EVENT_FIELDS, so the owner of a
     * personal event may set them exactly like a leader may. Hiding the entry
     * point took them with it: a member selling their own event could not
     * state a refund policy at all, and approval was settable once in the
     * create form and then never again.
     */
    const personal = (overrides: Record<string, unknown> = {}) =>
        baseProps({ event: baseEvent({ communityId: null, ...overrides }) });

    it("still opens, with the host's own settings", () => {
        renderWithConfig(<SettingsDrawer {...personal()} />);
        expect(screen.getByText("Settings")).toBeInTheDocument();
        expect(screen.getByText("Approval")).toBeInTheDocument();
        expect(screen.getByText("Refund policy")).toBeInTheDocument();
    });

    it("drops the rows the backend would 403", () => {
        // Not a policy choice here — assertCanConfigureCommunityScoped
        // refuses these outright when communityId is null.
        renderWithConfig(<SettingsDrawer {...personal()} />);
        expect(screen.queryByText("Visibility")).not.toBeInTheDocument();
        expect(screen.queryByText("Access")).not.toBeInTheDocument();
        expect(screen.queryByText("Distribution")).not.toBeInTheDocument();
    });

    it("summarises approval both ways", () => {
        renderWithConfig(<SettingsDrawer {...personal({ requiresApproval: true })} />);
        expect(screen.getByText("You review each registration")).toBeInTheDocument();
    });

    it("says registrations confirm instantly when approval is off", () => {
        renderWithConfig(<SettingsDrawer {...personal({ requiresApproval: false })} />);
        expect(screen.getByText("Registrations confirm instantly")).toBeInTheDocument();
    });

    it("opens the approval editor from its row", async () => {
        renderWithConfig(<SettingsDrawer {...personal()} />);
        await userEvent.click(screen.getByText("Approval"));
        // openModal animates for 300ms before swapping.
        await vi.waitFor(() =>
            expect(screen.getByText("What happens when someone registers.")).toBeInTheDocument(),
        );
    });
});

describe("SettingsDrawer — approval is not community-scoped", () => {
    it("offers Approval on a community event too", () => {
        // Same row, same place — ownership changes which OTHER rows appear,
        // never this one.
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        expect(screen.getByText("Approval")).toBeInTheDocument();
    });
});

describe("the drawer groups by who owns the setting", () => {
    /*
     * Gating alone was not enough. On a personal event the three
     * community-scoped rows just vanished, which reads as missing features
     * rather than one rule about ownership. The headings say which is which.
     */
    it("labels the community-scoped group on a community event", () => {
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        expect(screen.getByText("Community access")).toBeInTheDocument();
        expect(screen.getByText("Your settings")).toBeInTheDocument();
    });

    it("drops the community heading with its rows on a personal event", () => {
        // The heading must not outlive the rows it introduces.
        renderWithConfig(<SettingsDrawer {...baseProps({ event: baseEvent({ communityId: null }) })} />);
        expect(screen.queryByText("Community access")).not.toBeInTheDocument();
        expect(screen.queryByText("Visibility")).not.toBeInTheDocument();
    });

    it("keeps the host's own group on a personal event", () => {
        // Approval and Refund policy are the host's, so the group stays.
        renderWithConfig(<SettingsDrawer {...baseProps({ event: baseEvent({ communityId: null }) })} />);
        expect(screen.getByText("Your settings")).toBeInTheDocument();
        expect(screen.getByText("Approval")).toBeInTheDocument();
        expect(screen.getByText("Refund policy")).toBeInTheDocument();
    });
});
