import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddAttendeesModal } from "../page/modals/AddAttendeesModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * A comped VIP does not eat a General Admission seat.
 *
 * ── What this is defending ──────────────────────────────────────────────────
 *
 * A seat belongs to a ticket tier. This modal used to post `{ usertags,
 * emails }` with no tier at all, and the server fell back to the event's
 * default tier — so a host adding ten VIPs silently consumed ten General
 * Admission seats and was never asked.
 *
 * The assertion that matters is the POST body: `tierAssignments` is the only
 * thing the endpoint reads, and it validates every id against the event.
 */

const TIERS_WITH_OCCUPANCY = [
    { id: "t-ga", name: "General", capacity: 10, remaining: 4, soldOut: false },
    { id: "t-vip", name: "VIP", capacity: 2, remaining: 0, soldOut: true },
];

const ROSTER = {
    method: "GET",
    url: /\/memberships/,
    body: {
        members: [
            { id: "u-ana", name: "Ana Neto", usertag: "ana-neto", profileImage: null, roleGroups: [] },
        ],
    },
};
/* Suggestions are a shortcut, never load-bearing — answer empty rather than
   leaving them unmocked. */
const QUIET = [
    { method: "GET", url: /recent-invitees/, body: [] },
    { method: "GET", url: /frequent-attendees/, body: [] },
];

function open(tiers: any[] | undefined) {
    const onClose = vi.fn();
    renderWithConfig(
        <AddAttendeesModal
            event={{ name: "Retreat", endDate: "2099-01-01T00:00:00.000Z", attendees: [], tiers }}
            communityTag="c"
            eventId="evt-1"
            onUpdate={vi.fn()}
            onClose={onClose}
        />,
    );
    return { onClose };
}

function postedBody(fetchMock: ReturnType<typeof vi.fn>) {
    const call = fetchMock.mock.calls.find(
        ([url, init]: any) => String(url).includes("/add-attendees") && init?.method === "POST",
    );
    return call ? JSON.parse((call[1] as RequestInit).body as string) : null;
}

describe("choosing a ticket before adding", () => {
    it("sends the chosen tier per person", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /add-attendees/, body: { added: 1 } },
        ]);
        open(TIERS_WITH_OCCUPANCY);

        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Choose a ticket" }));
        // General is the only ticket with room, so it is already selected.
        await user.click(screen.getByRole("button", { name: "Review" }));
        await user.click(screen.getByRole("button", { name: "Add attendees" }));

        await waitFor(() => expect(postedBody(fetchMock)).toBeTruthy());
        expect(postedBody(fetchMock).tierAssignments).toEqual([
            { usertag: "ana-neto", email: null, tierId: "t-ga" },
        ]);
    });

    it("shows a full ticket without letting it be chosen", async () => {
        // Hiding VIP would leave the host wondering where it went. Showing it
        // full is what tells them to go raise the capacity.
        const user = userEvent.setup();
        mockFetch([ROSTER, ...QUIET]);
        open(TIERS_WITH_OCCUPANCY);

        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Choose a ticket" }));

        expect(screen.getByText("VIP").closest("button")).toBeDisabled();
        expect(screen.getByText("Full")).toBeInTheDocument();
        expect(screen.getByText("4 left")).toBeInTheDocument();
    });

    it("warns before adding more people than the ticket holds", async () => {
        const user = userEvent.setup();
        mockFetch([
            { method: "GET", url: /\/memberships/, body: {
                members: [
                    // Distinctive names: a one-letter name collides with
                    // every other "A" in the rendered modal.
                    { id: "u-a", name: "Ana Neto", usertag: "ana-neto", profileImage: null, roleGroups: [] },
                    { id: "u-b", name: "Bo Silva", usertag: "bo-silva", profileImage: null, roleGroups: [] },
                ],
            } },
            ...QUIET,
        ]);
        open([{ id: "t-ga", name: "General", capacity: 1, remaining: 1, soldOut: false }]);

        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByText("Bo Silva"));
        await user.click(screen.getByRole("button", { name: "Choose a ticket" }));

        expect(screen.getByText(/2 people on General/)).toBeInTheDocument();
        expect(screen.getByText(/1 more than General has room for/)).toBeInTheDocument();
    });
});

describe("when the backend has not shipped occupancy yet", () => {
    it("skips the step rather than inventing availability", async () => {
        /*
         * `soldOut` and `remaining` only arrive once the tier-bound-capacity
         * backend is deployed. Rendering the step without them would mean
         * presenting an unknown as "no limit" — the exact mistake that had the
         * public API reporting every tier available forever.
         *
         * So the step appears when the numbers do, and until then this behaves
         * as it did before while the server assigns the default tier.
         */
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /add-attendees/, body: { added: 1 } },
        ]);
        open([{ id: "t-ga", name: "General", capacity: 10 }]);   // no occupancy fields

        await user.click(await screen.findByText("Ana Neto"));
        expect(screen.queryByRole("button", { name: "Choose a ticket" })).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Review" }));
        await user.click(screen.getByRole("button", { name: "Add attendees" }));

        await waitFor(() => expect(postedBody(fetchMock)).toBeTruthy());
        expect(postedBody(fetchMock).tierAssignments).toBeUndefined();
        expect(postedBody(fetchMock).usertags).toEqual(["ana-neto"]);
    });

    it("skips the step on an event with no tiers at all", async () => {
        const user = userEvent.setup();
        mockFetch([ROSTER, ...QUIET]);
        open([]);

        await user.click(await screen.findByText("Ana Neto"));
        expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
    });
});
