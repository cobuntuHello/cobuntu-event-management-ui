import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddAttendeesModal } from "../page/modals/AddAttendeesModal";
import { AttendeeDetailDrawer } from "../components/AttendeesAndInvitationsSection/AttendeeDetailDrawer";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * Fixing a host's mistake (backend docs/features/add-vs-gift.md phase 5):
 * an undo window before anyone is emailed, a nudge for a guest with no name,
 * and, afterwards, naming a guest or taking back a place a host gave.
 */

const ROSTER = {
    method: "GET",
    url: /\/memberships/,
    body: { members: [{ id: "u-ana", name: "Ana Neto", usertag: "ana-neto", profileImage: null, roleGroups: [] }] },
};
const QUIET = [
    { method: "GET", url: /recent-invitees/, body: [] },
    { method: "GET", url: /frequent-attendees/, body: [] },
    { method: "GET", url: /invitations\?/, body: { invitations: [] } },
];
const posted = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(
    ([url, init]: any) => String(url).includes("/add-attendees") && init?.method === "POST",
);
const EVENT = { name: "Food for Thought", endDate: "2099-01-01T00:00:00.000Z", attendees: [] };

describe("Add people: the undo window", () => {
    it("counts down before sending; Undo sends nothing and keeps the list", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([ROSTER, ...QUIET, { method: "POST", url: /add-attendees/, body: { added: 1, failures: [] } }]);
        renderWithConfig(
            <AddAttendeesModal mode="add" event={EVENT} communityTag="c" eventId="evt-1" onUpdate={vi.fn()} onClose={vi.fn()} />,
            { config: { undoSeconds: 1 } },
        );
        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.click(screen.getByRole("button", { name: "Add" }));

        expect(screen.getByText("Adding 1 person in 1s")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Undo" }));
        expect(await screen.findByText(/Nothing was sent/)).toBeTruthy();
        await new Promise((r) => setTimeout(r, 1300));
        expect(posted(fetchMock)).toHaveLength(0);

        // Send again: this time it goes, after the window.
        await user.click(screen.getByRole("button", { name: "Add" }));
        await waitFor(() => expect(posted(fetchMock)).toHaveLength(1), { timeout: 2500 });
        // keepalive, so closing the tab during the window still sends it.
        expect((posted(fetchMock)[0][1] as RequestInit).keepalive).toBe(true);
    });

    it("a guest with no name is pointed out before sending", async () => {
        const user = userEvent.setup();
        mockFetch([ROSTER, ...QUIET, { method: "GET", url: /\/api\/users\//, status: 404, body: {} }, { method: "GET", url: /search/, body: { members: [] } }]);
        renderWithConfig(<AddAttendeesModal mode="add" event={EVENT} communityTag="c" eventId="evt-1" onUpdate={vi.fn()} onClose={vi.fn()} />);
        await screen.findByText("Ana Neto");
        await user.type(screen.getByPlaceholderText(/Search/), "rui@ruibarros.com");
        await user.click(await screen.findByText(/rui@ruibarros\.com/, { selector: "span" }));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        expect(screen.getByText("1 person has no name yet. Add it, or send anyway.")).toBeTruthy();
    });
});

describe("the attendee drawer: fixing it afterwards", () => {
    const guest = { id: "att-1", type: "guest", name: "rui@ruibarros.com", email: "rui@ruibarros.com", status: "APPROVED", addedBy: { id: "h" } };

    it("a guest can be named; an account holder cannot", async () => {
        const user = userEvent.setup();
        const onRename = vi.fn(async () => true);
        const { unmount } = renderWithConfig(<AttendeeDetailDrawer attendee={guest} onClose={vi.fn()} onRename={onRename} />);
        await user.click(await screen.findByRole("button", { name: "Add their name" }));
        await user.type(screen.getByPlaceholderText("Their name"), "Rui Barros");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(onRename).toHaveBeenCalledWith(guest, "Rui Barros"));
        unmount();

        renderWithConfig(<AttendeeDetailDrawer attendee={{ id: "att-2", type: "user", name: "Bea", usertag: "bea", status: "APPROVED" }} onClose={vi.fn()} onRename={onRename} />);
        await screen.findByText("Bea");
        expect(screen.queryByRole("button", { name: /their name|Edit name/ })).toBeNull();
    });

    it("a place a host gave can be taken back, after one confirmation", async () => {
        const user = userEvent.setup();
        const onRemove = vi.fn(async () => true);
        renderWithConfig(<AttendeeDetailDrawer attendee={guest} onClose={vi.fn()} onRemove={onRemove} canRemove />);
        await user.click(await screen.findByRole("button", { name: "Remove from event" }));
        expect(screen.getByText(/they get a short email/i)).toBeTruthy();
        expect(onRemove).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "Remove" }));
        await waitFor(() => expect(onRemove).toHaveBeenCalledWith(guest));
    });

    it("offers no Remove when the consumer says no (a paid place, or one they took themselves)", async () => {
        renderWithConfig(<AttendeeDetailDrawer attendee={guest} onClose={vi.fn()} onRemove={vi.fn()} canRemove={false} />);
        await screen.findByText("rui@ruibarros.com", { selector: "h2" });
        expect(screen.queryByRole("button", { name: "Remove from event" })).toBeNull();
    });
});
