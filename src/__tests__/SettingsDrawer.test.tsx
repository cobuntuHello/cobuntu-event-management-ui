import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsDrawer } from "../components/SettingsDrawer";
import { renderWithConfig } from "./test-utils";

const baseEvent = (overrides: Record<string, unknown> = {}) => ({
    id: "evt-1",
    slug: "lisbon-meetup",
    viewability: "PUBLIC",
    accessibility: "PUBLIC",
    detailSource: "NATIVE",
    externalDetailUrl: null,
    featured: false,
    funnelMode: null,
    funnelEmbedProvider: null,
    ...overrides,
});

const baseCommunity = (overrides: Record<string, unknown> = {}) => ({
    name: "PBN",
    accessibility: "OPEN",
    segmentCount: 1,
    ...overrides,
});

const baseProps = (overrides: Record<string, unknown> = {}) => ({
    event: baseEvent(),
    communityTag: "pbn",
    community: baseCommunity(),
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

    it("renders the heading + all four rows when isOpen=true", () => {
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        expect(screen.getByText("Settings")).toBeInTheDocument();
        expect(screen.getByText("Visibility")).toBeInTheDocument();
        expect(screen.getByText("Access")).toBeInTheDocument();
        expect(screen.getByText("Distribution")).toBeInTheDocument();
        expect(screen.getByText("Membership funnel")).toBeInTheDocument();
    });
});

describe("SettingsDrawer — summaries reflect event state", () => {
    it("Visibility = Public when viewability=PUBLIC", () => {
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        // The Visibility row's summary cell.
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

    it("Membership funnel summary = Off when funnelMode is null", () => {
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        const row = screen.getByText("Membership funnel").closest("button");
        expect(row).toHaveTextContent(/Off/);
    });

    it("Membership funnel summary = Link to /apply for APPLY_LINK", () => {
        renderWithConfig(
            <SettingsDrawer {...baseProps({ event: baseEvent({ funnelMode: "APPLY_LINK" }) })} />,
        );
        const row = screen.getByText("Membership funnel").closest("button");
        expect(row).toHaveTextContent(/Link to \/apply/);
    });

    it("Membership funnel summary = Embed · Tally for EMBED + tally provider", () => {
        renderWithConfig(
            <SettingsDrawer
                {...baseProps({
                    event: baseEvent({ funnelMode: "EMBED", funnelEmbedProvider: "tally" }),
                })}
            />,
        );
        const row = screen.getByText("Membership funnel").closest("button");
        expect(row).toHaveTextContent(/Embed · Tally/);
    });
});

describe("SettingsDrawer — past-event note", () => {
    it("hides the past-event note by default", () => {
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        expect(screen.queryByText(/event has ended/i)).not.toBeInTheDocument();
    });

    it("renders the past-event note when isPast=true and keeps all rows clickable", () => {
        renderWithConfig(<SettingsDrawer {...baseProps({ isPast: true })} />);
        expect(screen.getByText(/event has ended/i)).toBeInTheDocument();
        // All four rows still render — the note informs, doesn't gate.
        expect(screen.getByText("Visibility")).toBeInTheDocument();
        expect(screen.getByText("Access")).toBeInTheDocument();
        expect(screen.getByText("Distribution")).toBeInTheDocument();
        expect(screen.getByText("Membership funnel")).toBeInTheDocument();
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
        // DistributionEditModal renders helper copy unique to the modal —
        // use it to distinguish the modal from the row.
        expect(
            screen.getByText(/where members land when they click this event/i),
        ).toBeInTheDocument();
    });

    it("clicking the Visibility row swaps the drawer for the ViewabilityEditModal", async () => {
        const user = userEvent.setup();
        renderWithConfig(<SettingsDrawer {...baseProps()} />);
        await user.click(screen.getByText("Visibility").closest("button")!);
        await new Promise((r) => setTimeout(r, 350));
        // ViewabilityEditModal has a heading "Visibility" (singular).
        const headings = screen.getAllByRole("heading");
        // At least one heading should match Visibility now that we're in the modal.
        const found = headings.find((h) => /visibility/i.test(h.textContent || ""));
        expect(found).toBeTruthy();
    });
});
