import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddAttendeesModal } from "../page/modals/AddAttendeesModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * Adding people who have no account (a live report: a host wanted the
 * speakers on the attendee list).
 *
 * Three things went wrong there. The speakers reached the list as "Guest 1"
 * because nothing asked for a name; anyone the server refused vanished without
 * a reason; and a call that added nobody still showed "Done".
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

function open() {
    const onClose = vi.fn();
    renderWithConfig(
        <AddAttendeesModal
            event={{ name: "Food for Thought", endDate: "2099-01-01T00:00:00.000Z", attendees: [] }}
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

async function stageAddress(user: ReturnType<typeof userEvent.setup>, address: string) {
    await user.type(screen.getByPlaceholderText(/Search by name/), address);
    await user.click(await screen.findByText(`Send to ${address}`));
}

describe("adding people with no account", () => {
    it("asks for their name and sends it as guestNames", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /add-attendees/, body: { added: 1, alreadyAttending: 0, failed: 0, failures: [] } },
        ]);
        open();
        await screen.findByText("Ana Neto");
        await stageAddress(user, "speaker@example.com");
        await user.click(screen.getByRole("button", { name: "Write and preview" }));

        await user.type(screen.getByPlaceholderText("Their name"), "Ana Costa");
        await user.click(screen.getByRole("button", { name: "Send gift" }));

        await waitFor(() => expect(postedBody(fetchMock)).toBeTruthy());
        expect(postedBody(fetchMock)).toMatchObject({
            emails: ["speaker@example.com"],
            guestNames: [{ email: "speaker@example.com", name: "Ana Costa" }],
        });
    });

    it("sends the note TO them, as the gift note (customMessage), never as a host-only note", async () => {
        // Adding an attendee is giving them a ticket (backend docs/features/gifts.md).
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /add-attendees/, body: { added: 1, failures: [] } },
        ]);
        open();
        await screen.findByText("Ana Neto");
        await stageAddress(user, "speaker@example.com");
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.type(screen.getByPlaceholderText(/Add a note/), "Save me a seat");
        await user.click(screen.getByRole("button", { name: "Send gift" }));
        await waitFor(() => expect(postedBody(fetchMock)).toBeTruthy());
        expect(postedBody(fetchMock).customMessage).toBe("Save me a seat");
        expect(postedBody(fetchMock).internalNote).toBeUndefined();
    });

    it("sends no guestNames when nobody was named", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /add-attendees/, body: { added: 1, failures: [] } },
        ]);
        open();
        await screen.findByText("Ana Neto");
        await stageAddress(user, "speaker@example.com");
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.click(screen.getByRole("button", { name: "Send gift" }));
        await waitFor(() => expect(postedBody(fetchMock)).toBeTruthy());
        expect(postedBody(fetchMock).guestNames).toBeUndefined();
    });

    it("lists who was not added, and why, on the done screen", async () => {
        const user = userEvent.setup();
        mockFetch([
            ROSTER, ...QUIET,
            {
                method: "POST", url: /add-attendees/,
                body: { added: 1, alreadyAttending: 1, failed: 1, failures: [{ who: "full@example.com", reason: 'Tier "Standard" is at full capacity' }] },
            },
        ]);
        open();
        await screen.findByText("Ana Neto");
        await stageAddress(user, "full@example.com");
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.click(screen.getByRole("button", { name: "Send gift" }));

        expect(await screen.findByText(/1 ticket gifted for Food for Thought/)).toBeInTheDocument();
        expect(screen.getByText("Not added")).toBeInTheDocument();
        expect(screen.getByText('full@example.com: Tier "Standard" is at full capacity')).toBeInTheDocument();
        expect(screen.getByText("1 person was already attending.")).toBeInTheDocument();
    });

    it("keeps the list and explains when nobody was added", async () => {
        const user = userEvent.setup();
        mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /add-attendees/, body: { added: 0, alreadyAttending: 1, failed: 0, failures: [] } },
        ]);
        const { onClose } = open();
        await screen.findByText("Ana Neto");
        await stageAddress(user, "again@example.com");
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.click(screen.getByRole("button", { name: "Send gift" }));

        expect(await screen.findByText("Nobody was added. 1 person was already attending.")).toBeInTheDocument();
        expect(screen.queryByText(/gifted for Food for Thought/)).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("tells the host to type the address when a name matches nobody", async () => {
        const user = userEvent.setup();
        mockFetch([
            ROSTER, ...QUIET,
            { method: "GET", url: /\/members\/search\?/, body: { members: [] } },
        ]);
        open();
        await screen.findByText("Ana Neto");
        await user.type(screen.getByPlaceholderText(/Search by name/), "Rui Barros");
        // The gift-tickets copy (0.104.0, #265): no account is needed to receive one.
        expect(await screen.findByText("Not a member here? Type their @usertag, or their full email address. No account needed.")).toBeInTheDocument();
    });
});
