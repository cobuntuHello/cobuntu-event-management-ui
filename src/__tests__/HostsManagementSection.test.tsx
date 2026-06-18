import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HostsManagementSection } from "../components/hosts/HostsManagementSection";
import { renderWithConfig, mockFetch } from "./test-utils";

const userOwnedEvent = {
    id: "evt-user-1",
    communityId: null as string | null,
    createdByUserId: "u-creator",
};

const communityOwnedEvent = {
    id: "evt-com-1",
    communityId: "c-1" as string | null,
    createdByUserId: "u-leader",
};

const hostsResponse = [
    { id: "h-creator", userId: "u-creator", role: "CREATOR", user: { id: "u-creator", name: "Alice Creator", usertag: "alice" } },
    { id: "h-bob", userId: "u-bob", role: "CO_HOST", user: { id: "u-bob", name: "Bob", usertag: "bob" } },
    { id: "h-promoted", userId: "u-promoted", role: "CO_HOST", user: { id: "u-promoted", name: "Carol Promoted", usertag: "carol" } },
];

const attendeesResponse = [
    // Carol was promoted from an attendance, so she has an event_attendances row.
    { id: "att-carol", userId: "u-promoted", status: "APPROVED", user: { id: "u-promoted", name: "Carol Promoted", usertag: "carol" } },
    // Dave is APPROVED + paid + not a host → eligible for promote.
    { id: "att-dave", userId: "u-dave", status: "APPROVED", user: { id: "u-dave", name: "Dave Attendee", usertag: "dave" } },
];

describe("HostsManagementSection — rendering", () => {
    it("shows a Loading placeholder before the hosts list resolves", async () => {
        let resolveHosts: (() => void) | null = null;
        global.fetch = vi.fn(async (url: string) => {
            if (String(url).endsWith("/hosts")) {
                await new Promise<void>((r) => { resolveHosts = r; });
                return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
            }
            return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
        }) as any;

        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        expect(await screen.findByText(/loading hosts/i)).toBeInTheDocument();
        (resolveHosts as any)?.();
    });

    it("renders all hosts after the fetch resolves", async () => {
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: attendeesResponse },
        ]);
        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => {
            expect(screen.getByText("Alice Creator")).toBeInTheDocument();
            expect(screen.getByText("Bob")).toBeInTheDocument();
            expect(screen.getByText("Carol Promoted")).toBeInTheDocument();
        });
    });
});

describe("HostsManagementSection — creator-immutability", () => {
    it("shows the Creator badge on the user-owned event's creator-host", async () => {
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: attendeesResponse },
        ]);
        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => expect(screen.getByText("Alice Creator")).toBeInTheDocument());
        // Creator badge appears once (only on Alice).
        const badges = screen.getAllByText(/^creator$/i);
        expect(badges).toHaveLength(1);
    });

    it("does NOT show the Creator badge on community-owned events (no immutability)", async () => {
        const leaderHosts = hostsResponse.map((h) =>
            h.userId === "u-creator" ? { ...h, userId: "u-leader", user: { ...h.user, id: "u-leader" } } : h,
        );
        mockFetch([
            { url: "/hosts", body: leaderHosts },
            { url: "/attendees", body: [] },
        ]);
        renderWithConfig(
            <HostsManagementSection event={communityOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => expect(screen.getByText("Alice Creator")).toBeInTheDocument());
        expect(screen.queryByText(/^creator$/i)).not.toBeInTheDocument();
    });

    it("hides the row's action button on the immutable creator-host", async () => {
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: attendeesResponse },
        ]);
        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => expect(screen.getByText("Alice Creator")).toBeInTheDocument());
        // 3 hosts; 2 of them (Bob, Carol) have an inline action button.
        // The creator row has no Remove/Demote button — only the badge.
        const removeButtons = screen.getAllByRole("button", { name: /^remove$|demote to attendee/i });
        expect(removeButtons).toHaveLength(2);
    });
});

describe("HostsManagementSection — demote vs remove label", () => {
    it('renders "Demote to attendee" inline for a host with an attendance row', async () => {
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: attendeesResponse },
        ]);
        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => expect(screen.getByText("Carol Promoted")).toBeInTheDocument());
        // Carol has an APPROVED attendance → label is "Demote to attendee".
        expect(screen.getByRole("button", { name: /demote to attendee/i })).toBeInTheDocument();
    });

    it('renders "Remove" inline for a host with no attendance row', async () => {
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: attendeesResponse },
        ]);
        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());
        // Bob has no attendance → at least one inline "Remove" exists.
        const removeButtons = screen.getAllByRole("button", { name: /^remove$/i });
        expect(removeButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('renders "Remove" (not "Demote") when the host has a CANCELLED attendance', async () => {
        // Regression for the PBN W35 Raj case: a host whose attendance was
        // CANCELLED should read "Remove" — demoting onto a cancelled row
        // wouldn't preserve any live registration anyway.
        const cancelledAttendances = [
            { id: "att-carol", userId: "u-promoted", status: "CANCELLED", user: { id: "u-promoted", name: "Carol Promoted", usertag: "carol" } },
        ];
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: cancelledAttendances },
        ]);
        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => expect(screen.getByText("Carol Promoted")).toBeInTheDocument());
        expect(screen.queryByRole("button", { name: /demote to attendee/i })).not.toBeInTheDocument();
        // All 3 non-creator hosts read "Remove" since none have a live attendance.
        const removeButtons = screen.getAllByRole("button", { name: /^remove$/i });
        expect(removeButtons).toHaveLength(2);
    });

    it('renders "Demote to attendee" for a host with PENDING attendance', async () => {
        const pendingAttendances = [
            { id: "att-carol", userId: "u-promoted", status: "PENDING", user: { id: "u-promoted", name: "Carol Promoted", usertag: "carol" } },
        ];
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: pendingAttendances },
        ]);
        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => expect(screen.getByText("Carol Promoted")).toBeInTheDocument());
        expect(screen.getByRole("button", { name: /demote to attendee/i })).toBeInTheDocument();
    });
});

describe("HostsManagementSection — canManage gating", () => {
    it("hides the add-host buttons when canManage=false", async () => {
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: attendeesResponse },
        ]);
        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={false} />,
        );
        await waitFor(() => expect(screen.getByText("Alice Creator")).toBeInTheDocument());
        expect(screen.queryByRole("button", { name: /add member/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /promote attendee/i })).not.toBeInTheDocument();
    });

    it("hides per-row inline buttons when canManage=false", async () => {
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: attendeesResponse },
        ]);
        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={false} />,
        );
        await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());
        expect(screen.queryByRole("button", { name: /^remove$|demote to attendee/i })).not.toBeInTheDocument();
    });

    it("hides action buttons for a past event even when canManage=true", async () => {
        const pastEvent = { ...userOwnedEvent, endDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString() };
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: attendeesResponse },
        ]);
        renderWithConfig(
            <HostsManagementSection event={pastEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());
        expect(screen.queryByRole("button", { name: /add member/i })).not.toBeInTheDocument();
    });
});

describe("HostsManagementSection — promote eligibility", () => {
    it("hides the Promote button when no eligible attendees", async () => {
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: [] }, // no Dave → nothing eligible
        ]);
        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => expect(screen.getByText("Alice Creator")).toBeInTheDocument());
        expect(screen.queryByRole("button", { name: /promote attendee/i })).not.toBeInTheDocument();
    });

    it("shows the Promote button when there's at least one APPROVED attendee who isn't already a host", async () => {
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: attendeesResponse }, // Dave is eligible
        ]);
        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() =>
            expect(screen.getByRole("button", { name: /promote attendee/i })).toBeInTheDocument(),
        );
    });

    it("respects a consumer-provided eligibleAttendees override", async () => {
        mockFetch([
            { url: "/hosts", body: hostsResponse },
            { url: "/attendees", body: [] }, // BE would say zero
        ]);
        renderWithConfig(
            <HostsManagementSection
                event={userOwnedEvent}
                communityTag="c"
                canManage={true}
                eligibleAttendees={[
                    { id: "x", userId: "u-x", name: "Override Eligible", usertag: "x", profileImage: null, email: null },
                ]}
            />,
        );
        await waitFor(() =>
            expect(screen.getByRole("button", { name: /promote attendee/i })).toBeInTheDocument(),
        );
    });
});

describe("HostsManagementSection — remove flow (via confirm modal)", () => {
    it("opens the confirm modal, confirms, calls DELETE, then refreshes", async () => {
        const user = userEvent.setup();
        let hostsCallCount = 0;
        const fetchMock = mockFetch([
            {
                method: "GET",
                url: "/hosts",
                bodyFn: () => {
                    hostsCallCount += 1;
                    return hostsCallCount === 1 ? hostsResponse : hostsResponse.filter((h) => h.userId !== "u-bob");
                },
            },
            { method: "GET", url: "/attendees", body: attendeesResponse },
            { method: "DELETE", url: /\/hosts\/u-bob$/, body: { message: "ok", action: "REMOVED" } },
        ]);

        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());

        // Click Bob's inline "Remove" → confirm modal opens.
        const removeButtons = screen.getAllByRole("button", { name: /^remove$/i });
        await user.click(removeButtons[0]);
        expect(await screen.findByRole("dialog")).toBeInTheDocument();

        // Modal headline includes Bob's name + intent.
        expect(screen.getByText(/remove bob from hosts\?/i)).toBeInTheDocument();

        // Confirm.
        const confirmButton = screen.getAllByRole("button", { name: /remove from hosts/i })[0];
        await user.click(confirmButton);

        // Bob removed; DELETE called once.
        await waitFor(() => expect(screen.queryByText("Bob")).not.toBeInTheDocument());
        const calls = (fetchMock as any).mock.calls.filter((c: any[]) => /\/hosts\/u-bob$/.test(c[0]));
        expect(calls).toHaveLength(1);
    });

    it("restores the chip + surfaces error if DELETE returns 403 EVENT_CREATOR_IMMUTABLE", async () => {
        const user = userEvent.setup();
        mockFetch([
            { method: "GET", url: "/hosts", body: hostsResponse },
            { method: "GET", url: "/attendees", body: attendeesResponse },
            { method: "DELETE", url: /\/hosts\/u-bob$/, status: 403, body: { code: "EVENT_CREATOR_IMMUTABLE" } },
        ]);

        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());

        const removeButtons = screen.getAllByRole("button", { name: /^remove$/i });
        await user.click(removeButtons[0]);
        const confirmButton = screen.getAllByRole("button", { name: /remove from hosts/i })[0];
        await user.click(confirmButton);

        await waitFor(() =>
            expect(screen.getByText(/event creator can't be removed/i)).toBeInTheDocument(),
        );
        expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    it("shows the dynamic 'aesthetic-only' warning when target has manage-events role", async () => {
        const user = userEvent.setup();
        const hostsWithRole = hostsResponse.map((h) =>
            h.userId === "u-bob" ? { ...h, hasManageEventsRole: true } : h,
        );
        mockFetch([
            { url: "/hosts", body: hostsWithRole },
            { url: "/attendees", body: attendeesResponse },
        ]);

        renderWithConfig(
            <HostsManagementSection
                event={userOwnedEvent}
                communityTag="c"
                communityName="PBN"
                canManage={true}
            />,
        );
        await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());
        const removeButtons = screen.getAllByRole("button", { name: /^remove$/i });
        await user.click(removeButtons[0]);

        expect(await screen.findByText(/mostly aesthetic/i)).toBeInTheDocument();
        expect(screen.getByText(/manage-events role/i)).toBeInTheDocument();
    });

    it("rephrases warning in the second person when operator removes themselves", async () => {
        const user = userEvent.setup();
        const hostsWithRole = hostsResponse.map((h) =>
            h.userId === "u-bob" ? { ...h, hasManageEventsRole: true } : h,
        );
        mockFetch([
            { url: "/hosts", body: hostsWithRole },
            { url: "/attendees", body: attendeesResponse },
        ]);

        renderWithConfig(
            <HostsManagementSection
                event={userOwnedEvent}
                communityTag="c"
                communityName="PBN"
                canManage={true}
                currentUserId="u-bob"
            />,
        );
        await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());
        const removeButtons = screen.getAllByRole("button", { name: /^remove$/i });
        await user.click(removeButtons[0]);

        // Self-voice: "You'll still be able to manage…"
        expect(await screen.findByText(/you'll still be able to manage/i)).toBeInTheDocument();
    });

    it("Cancel closes the modal without issuing DELETE", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            { method: "GET", url: "/hosts", body: hostsResponse },
            { method: "GET", url: "/attendees", body: attendeesResponse },
        ]);

        renderWithConfig(
            <HostsManagementSection event={userOwnedEvent} communityTag="c" canManage={true} />,
        );
        await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());
        const removeButtons = screen.getAllByRole("button", { name: /^remove$/i });
        await user.click(removeButtons[0]);
        await user.click(screen.getByRole("button", { name: /cancel/i }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        const deleteCalls = (fetchMock as any).mock.calls.filter((c: any[]) => c[1]?.method === "DELETE");
        expect(deleteCalls).toHaveLength(0);
        expect(screen.getByText("Bob")).toBeInTheDocument();
    });
});
