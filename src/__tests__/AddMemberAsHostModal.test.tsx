import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddMemberAsHostModal } from "../components/hosts/AddMemberAsHostModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * The picker BROWSES now: the community's members are on screen before anything
 * is typed, and search is the fallback for somebody the roster does not hold.
 * Every case here therefore needs the roster stubbed, and picking somebody is
 * two steps rather than one.
 */
const ROSTER_ROUTE = {
    method: "GET",
    url: /\/memberships/,
    body: { members: [{ id: "u-2", name: "Beth", usertag: "beth", profileImage: null, roleGroups: [] }] },
};

/** Pick Beth and advance to the review step, the way an operator does. */
async function pickBeth(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByText("Beth"));
    await user.click(screen.getByRole("button", { name: "Review" }));
}

const baseProps = (overrides: Partial<React.ComponentProps<typeof AddMemberAsHostModal>> = {}) => ({
    eventId: "evt-1",
    communityTag: "c",
    excludeUserIds: ["u-existing-host"],
    open: true,
    onClose: vi.fn(),
    onAdded: vi.fn(),
    ...overrides,
});

describe("AddMemberAsHostModal — picker", () => {
    it("does not render when open=false", () => {
        renderWithConfig(<AddMemberAsHostModal {...baseProps({ open: false })} />);
        expect(screen.queryByText(/add community member as host/i)).not.toBeInTheDocument();
    });

    it("shows the community's members before anything is typed", async () => {
        // This asserted "start typing to search" — an empty box is a dead end
        // for somebody who does not yet know whose name they want, and removing
        // it was the point of the change.
        mockFetch([ROSTER_ROUTE]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        expect(await screen.findByText("Beth")).toBeInTheDocument();
    });

    it("falls back to the search endpoint for somebody the roster does not hold", async () => {
        /*
         * This used to assert that ANY typing hit /members/search. It does not
         * any more: the roster answers first, so the common case makes no
         * request at all. Search survives for the person who is not in it —
         * which on an invite-style surface is most of the point — and that is
         * what this now pins, including that exclusions still travel with it.
         */
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            ROSTER_ROUTE,
            { method: "GET", url: /\/members\/search\?/, body: { members: [{ id: "u-9", name: "Zed", usertag: "zed", profileImage: null }] } },
        ]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        await screen.findByText("Beth");

        // "zed" matches nobody in the roster, so the fallback runs.
        await user.type(screen.getByPlaceholderText(/search by name/i), "zed");
        await waitFor(() => expect(screen.getByText("Zed")).toBeInTheDocument());

        const calls = (fetchMock as any).mock.calls.filter((c: any[]) => /\/members\/search\?/.test(c[0]));
        expect(calls.length).toBeGreaterThanOrEqual(1);
        const lastUrl = String(calls[calls.length - 1][0]);
        expect(lastUrl).toMatch(/q=zed/);
        expect(lastUrl).toMatch(/excludeUserIds=u-existing-host/);
    });

    it("shows 'No matches.' when the BE returns an empty list", async () => {
        const user = userEvent.setup();
        mockFetch([
            { method: "GET", url: /\/memberships/, body: { members: [] } },
            { method: "GET", url: /\/members\/search\?/, body: { members: [] } },
        ]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        await user.type(screen.getByPlaceholderText(/search by name/i), "zz");
        await waitFor(() => expect(screen.getByText(/no matches/i)).toBeInTheDocument());
    });
});

describe("AddMemberAsHostModal — confirm + POST", () => {
    it("advances to the confirm step with a 'What happens next' info block when a member is picked", async () => {
        const user = userEvent.setup();
        mockFetch([
            ROSTER_ROUTE,
            { method: "GET", url: /\/members\/search\?/, body: { members: [{ id: "u-2", name: "Beth", usertag: "beth", profileImage: null }] } },
        ]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        await pickBeth(user);
        expect(await screen.findByText(/what happens next/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /add as host/i })).toBeInTheDocument();
    });

    it("POSTs { userId } to /events/:id/hosts and calls onAdded on success", async () => {
        const user = userEvent.setup();
        const onAdded = vi.fn();
        const onClose = vi.fn();
        const fetchMock = mockFetch([
            ROSTER_ROUTE,
            { method: "GET", url: /\/members\/search\?/, body: { members: [{ id: "u-2", name: "Beth", usertag: "beth", profileImage: null }] } },
            { method: "POST", url: /\/events\/evt-1\/hosts$/, status: 201, body: { id: "h-2", userId: "u-2" } },
        ]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps({ onAdded, onClose })} />);
        await pickBeth(user);
        await user.click(screen.getByRole("button", { name: /add as host/i }));

        await waitFor(() => expect(onAdded).toHaveBeenCalled());
        expect(onClose).toHaveBeenCalled();
        // Verify the POST body shape was the new { userId } not the legacy { coHostUserId }.
        const postCall = (fetchMock as any).mock.calls.find((c: any[]) => /\/events\/evt-1\/hosts$/.test(c[0]) && c[1]?.method === "POST");
        expect(postCall).toBeTruthy();
        const body = JSON.parse(postCall[1].body);
        expect(body).toEqual({ userId: "u-2" });
    });

    it("surfaces a friendly message on 409 (already a host)", async () => {
        const user = userEvent.setup();
        mockFetch([
            ROSTER_ROUTE,
            { method: "GET", url: /\/members\/search\?/, body: { members: [{ id: "u-2", name: "Beth", usertag: "beth", profileImage: null }] } },
            { method: "POST", url: /\/events\/evt-1\/hosts$/, status: 409, body: { code: "ALREADY_HOST" } },
        ]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        await pickBeth(user);
        await user.click(screen.getByRole("button", { name: /add as host/i }));

        await waitFor(() =>
            expect(screen.getByText(/this person is already a host/i)).toBeInTheDocument(),
        );
    });

    it("surfaces a friendly message on 403", async () => {
        const user = userEvent.setup();
        mockFetch([
            ROSTER_ROUTE,
            { method: "GET", url: /\/members\/search\?/, body: { members: [{ id: "u-2", name: "Beth", usertag: "beth", profileImage: null }] } },
            { method: "POST", url: /\/events\/evt-1\/hosts$/, status: 403, body: { error: "no perm" } },
        ]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        await pickBeth(user);
        await user.click(screen.getByRole("button", { name: /add as host/i }));

        await waitFor(() =>
            expect(screen.getByText(/don't have permission/i)).toBeInTheDocument(),
        );
    });

    it("the breadcrumb walks back to the picker", async () => {
        // Back moved OUT of the footer and into the breadcrumb, matching where
        // back lives on the event and product detail pages.
        const user = userEvent.setup();
        mockFetch([ROSTER_ROUTE]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        await pickBeth(user);
        await user.click(screen.getByRole("button", { name: "Back" }));

        expect(screen.getByPlaceholderText(/search by name/i)).toBeInTheDocument();
        expect(screen.getByText("Beth")).toBeInTheDocument();
    });
});
