import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MembershipFunnelSection } from "../components/MembershipFunnelSection";
import { renderWithConfig, mockFetch } from "./test-utils";

const TALLY_EMBED =
    '<iframe src="https://tally.so/embed/wM5R7q" width="100%" height="500"></iframe>';

const baseProps = (overrides: Record<string, unknown> = {}) => ({
    event: {
        id: "evt-1",
        accessibility: "PUBLIC",
        viewability: "PUBLIC",
        funnelMode: null,
        funnelEmbedCode: null,
        funnelEmbedProvider: null,
    },
    communityTag: "pbn",
    community: {
        name: "PBN",
        accessibility: "OPEN",
        segmentCount: 1,
    },
    onSaved: vi.fn(),
    onRequestEditSettings: vi.fn(),
    showToast: vi.fn(),
    ...overrides,
});

describe("MembershipFunnelSection — blocked states", () => {
    it("renders blocked UI when community is INVITE_ONLY (no edit-settings button)", () => {
        const props = baseProps({ community: { name: "PBN", accessibility: "INVITE_ONLY", segmentCount: 0 } });
        renderWithConfig(<MembershipFunnelSection {...props} />);
        expect(screen.getByText(/invite-only/i)).toBeInTheDocument();
        // No edit-settings button when blocked at the community level (can't fix from event editor).
        expect(screen.queryByRole("button", { name: /open event settings/i })).not.toBeInTheDocument();
    });

    it("renders blocked UI when event viewability is MEMBERS_ONLY (with edit-settings button)", async () => {
        const onRequestEditSettings = vi.fn();
        const props = baseProps({
            event: {
                id: "evt-1",
                accessibility: "PUBLIC",
                viewability: "MEMBERS_ONLY",
                funnelMode: null,
            },
            onRequestEditSettings,
        });
        renderWithConfig(<MembershipFunnelSection {...props} />);
        expect(screen.getByText(/event viewability is set to members only/i)).toBeInTheDocument();
        const btn = screen.getByRole("button", { name: /open event settings/i });
        const user = userEvent.setup();
        await user.click(btn);
        expect(onRequestEditSettings).toHaveBeenCalled();
    });

    it("renders blocked UI when event accessibility is MEMBERS_ONLY", () => {
        const props = baseProps({
            event: {
                id: "evt-1",
                accessibility: "MEMBERS_ONLY",
                viewability: "PUBLIC",
                funnelMode: null,
            },
        });
        renderWithConfig(<MembershipFunnelSection {...props} />);
        expect(screen.getByText(/event accessibility is set to members only/i)).toBeInTheDocument();
    });
});

describe("MembershipFunnelSection — active config", () => {
    it("renders three mode radios", () => {
        renderWithConfig(<MembershipFunnelSection {...baseProps()} />);
        expect(screen.getByText(/^None$/)).toBeInTheDocument();
        expect(screen.getByText(/external form/i)).toBeInTheDocument();
        expect(screen.getByText(/link to apply page/i)).toBeInTheDocument();
    });

    it("PATCHes mode=null when initial is APPLY_LINK and host picks None", async () => {
        const fetchMock = mockFetch([
            { method: "PATCH", url: "/api/communities/pbn/events/evt-1/funnel", body: { mode: null } },
        ]);
        const props = baseProps({
            event: { id: "evt-1", accessibility: "PUBLIC", viewability: "PUBLIC", funnelMode: "APPLY_LINK" },
        });
        const user = userEvent.setup();
        renderWithConfig(<MembershipFunnelSection {...props} />);
        await user.click(screen.getByText(/^None$/));
        await user.click(screen.getByRole("button", { name: /^save$/i }));
        await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body).toEqual({ mode: null });
    });

    it("PATCHes mode=APPLY_LINK when host selects it", async () => {
        const fetchMock = mockFetch([
            { method: "PATCH", url: "/api/communities/pbn/events/evt-1/funnel", body: { mode: "APPLY_LINK" } },
        ]);
        const props = baseProps();
        const user = userEvent.setup();
        renderWithConfig(<MembershipFunnelSection {...props} />);
        await user.click(screen.getByText(/link to apply page/i));
        await user.click(screen.getByRole("button", { name: /^save$/i }));
        await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body).toEqual({ mode: "APPLY_LINK" });
    });

    it("PATCHes mode=EMBED with the pasted code", async () => {
        const fetchMock = mockFetch([
            { method: "PATCH", url: "/api/communities/pbn/events/evt-1/funnel", body: { mode: "EMBED" } },
        ]);
        const props = baseProps();
        const user = userEvent.setup();
        renderWithConfig(<MembershipFunnelSection {...props} />);
        await user.click(screen.getByText(/external form/i));
        await user.type(screen.getByPlaceholderText(/<iframe/), TALLY_EMBED);
        // Provider detected
        expect(screen.getByText(/tally form detected/i)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /^save$/i }));
        await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.mode).toBe("EMBED");
        expect(body.embedCode).toBe(TALLY_EMBED);
    });

    it("disables Save when EMBED is selected but the pasted code is invalid", async () => {
        const props = baseProps();
        const user = userEvent.setup();
        renderWithConfig(<MembershipFunnelSection {...props} />);
        await user.click(screen.getByText(/external form/i));
        await user.type(
            screen.getByPlaceholderText(/<iframe/),
            '<iframe src="https://surveymonkey.com/r/abc"></iframe>',
        );
        expect(screen.getByText(/only tally, jotform, and typeform/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    });

    it("warns inline when switching from EMBED to APPLY_LINK with existing code", async () => {
        const props = baseProps({
            event: {
                id: "evt-1",
                accessibility: "PUBLIC",
                viewability: "PUBLIC",
                funnelMode: "EMBED",
                funnelEmbedCode: TALLY_EMBED,
                funnelEmbedProvider: "tally",
            },
        });
        const user = userEvent.setup();
        renderWithConfig(<MembershipFunnelSection {...props} />);
        await user.click(screen.getByText(/link to apply page/i));
        expect(screen.getByText(/switching modes will discard/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /discard and save/i })).toBeInTheDocument();
    });

    it("warns when host picks APPLY_LINK on a community with 0 segments", async () => {
        const props = baseProps({
            community: { name: "PBN", accessibility: "OPEN", segmentCount: 0 },
        });
        const user = userEvent.setup();
        renderWithConfig(<MembershipFunnelSection {...props} />);
        await user.click(screen.getByText(/link to apply page/i));
        expect(screen.getByText(/no membership tiers yet/i)).toBeInTheDocument();
        // Doesn't block save:
        expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();
    });

    it("surfaces a BE error inline + via toast on failed save", async () => {
        mockFetch([
            {
                method: "PATCH",
                url: "/api/communities/pbn/events/evt-1/funnel",
                status: 400,
                body: { error: "Embed URL must use HTTPS.", code: "FUNNEL_EMBED_NOT_HTTPS" },
            },
        ]);
        const props = baseProps();
        const user = userEvent.setup();
        renderWithConfig(<MembershipFunnelSection {...props} />);
        await user.click(screen.getByText(/link to apply page/i));
        await user.click(screen.getByRole("button", { name: /^save$/i }));
        await waitFor(() => expect(props.showToast).toHaveBeenCalledWith("Embed URL must use HTTPS."));
        // Inline error visible too
        expect(screen.getByText(/embed url must use https/i)).toBeInTheDocument();
        // onSaved NOT called on failure
        expect(props.onSaved).not.toHaveBeenCalled();
    });

    it("Cancel reverts state to initial without saving", async () => {
        const props = baseProps();
        const user = userEvent.setup();
        renderWithConfig(<MembershipFunnelSection {...props} />);
        await user.click(screen.getByText(/link to apply page/i));
        // Cancel button appears once dirty
        await user.click(screen.getByRole("button", { name: /^cancel$/i }));
        // Save should be disabled again (no dirty state)
        expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    });
});
