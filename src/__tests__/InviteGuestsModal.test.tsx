import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InviteGuestsModal } from "../page/modals/InviteGuestsModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * Inviting guests, on the shared picker.
 *
 * This was a single long screen of local primitives and is now two steps of
 * PersonPickerModal. What is worth pinning is the BODY it posts, because that
 * is where the two failure modes live: a member sent as a bare address gets
 * invited twice, and an override sent for somebody who never wrote one
 * replaces their shared note with nothing.
 *
 * The chrome is the shared component's, and it has its own tests.
 */

const ROSTER = {
    method: "GET",
    url: /\/memberships/,
    body: {
        members: [
            { id: "u-ana", name: "Ana Neto", usertag: "ana-neto", email: "ana@example.com", profileImage: null, roleGroups: [] },
            { id: "u-bo", name: "Bo Silva", usertag: "bo", email: "bo@example.com", profileImage: null, roleGroups: [] },
        ],
    },
};
/* Suggestions and the preview are nice-to-haves that must never break the
   flow, so they answer empty rather than going unmocked. */
const QUIET = [
    { method: "GET", url: /recent-invitees/, body: [] },
    { method: "GET", url: /frequent-attendees/, body: [] },
    { method: "GET", url: /email-templates/, body: { html: "<p>preview</p>" } },
];

const EVENT = { name: "Retreat", endDate: "2099-01-01T00:00:00.000Z", attendees: [] };

function open(overrides: Record<string, unknown> = {}) {
    const onClose = vi.fn();
    renderWithConfig(
        <InviteGuestsModal
            event={EVENT}
            communityTag="c"
            eventId="evt-1"
            onClose={onClose}
            {...overrides}
        />,
    );
    return { onClose };
}

/** What the modal POSTed to the invitations endpoint. */
function postedBody(fetchMock: ReturnType<typeof vi.fn>) {
    const call = fetchMock.mock.calls.find(
        ([url, init]: any) => String(url).includes("/invitations") && init?.method === "POST",
    );
    return call ? JSON.parse((call[1] as RequestInit).body as string) : null;
}

describe("InviteGuestsModal", () => {
    it("sends a member by handle, not as a bare address", async () => {
        // Ana is a member whose address the roster knows. Sending both is one
        // person, two invitations and two emails.
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /\/invitations/, body: { success: 1 } },
        ]);
        open();

        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.click(screen.getByRole("button", { name: "Send invitations" }));

        await waitFor(() => expect(postedBody(fetchMock)).toBeTruthy());
        expect(postedBody(fetchMock)).toMatchObject({ usertags: ["ana-neto"] });
        expect(postedBody(fetchMock).emails).toBeUndefined();
    });

    it("sends somebody with no account by address", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /\/invitations/, body: { success: 1 } },
        ]);
        open();
        await screen.findByText("Ana Neto");

        await user.type(screen.getByPlaceholderText(/Search by name/), "outsider@example.com");
        await user.click(await screen.findByText("Invite outsider@example.com"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.click(screen.getByRole("button", { name: "Send invitations" }));

        await waitFor(() => expect(postedBody(fetchMock)).toBeTruthy());
        expect(postedBody(fetchMock)).toMatchObject({ emails: ["outsider@example.com"] });
        expect(postedBody(fetchMock).usertags).toBeUndefined();
    });

    it("carries the shared note, and one person's own note as an override", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /\/invitations/, body: { success: 2 } },
        ]);
        open();

        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByText("Bo Silva"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));

        await user.type(screen.getByPlaceholderText(/Add a personal note/), "See you there");
        await user.click(screen.getAllByRole("button", { name: "Write to them" })[0]);
        await user.type(screen.getByPlaceholderText(/Write to Ana Neto/), "Bring the slides");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await user.click(screen.getByRole("button", { name: "Send invitations" }));

        await waitFor(() => expect(postedBody(fetchMock)).toBeTruthy());
        const body = postedBody(fetchMock);
        expect(body.customMessage).toBe("See you there");
        // Only Ana. Bo never wrote one, and an empty override would replace
        // his shared note with nothing.
        expect(body.perRecipientMessages).toEqual([
            { usertag: "ana-neto", message: "Bring the slides" },
        ]);
    });

    it("keeps the staged list and shows why when the send fails", async () => {
        // The old modal toasted and left the list behind the toast. A failure
        // must not cost somebody a CSV import they just made.
        const user = userEvent.setup();
        mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /\/invitations/, status: 403, body: { error: "You cannot invite on this event." } },
        ]);
        const { onClose } = open();

        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.click(screen.getByRole("button", { name: "Send invitations" }));

        expect(await screen.findByText("You cannot invite on this event.")).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("refuses to send once the event has ended", async () => {
        /*
         * The old modal disabled its own submit button. The shared picker's
         * confirm is always live, so the rule moved into the handler — which
         * is where it belongs, since the server enforces it too.
         */
        const user = userEvent.setup();
        const fetchMock = mockFetch([ROSTER, ...QUIET]);
        open({ event: { ...EVENT, endDate: "2020-01-01T00:00:00.000Z" } });

        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.click(screen.getByRole("button", { name: "Send invitations" }));

        // Scoped to the error, because the amber banner above carries the
        // same sentence — that it warns AND refuses is the point.
        expect(await screen.findByText(/This event has ended/, { selector: "p.text-red-600" }))
            .toBeInTheDocument();
        expect(postedBody(fetchMock)).toBeNull();
    });

    it("shows the delivery screen rather than closing on success", async () => {
        // The picker closes itself once onConfirm resolves. This modal wants
        // the celebration instead, which is why it gates its own onClose.
        const user = userEvent.setup();
        mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /\/invitations/, body: { success: 1 } },
            { method: "GET", url: /deliveries|invitations\?/, body: { invitations: [] } },
        ]);
        const { onClose } = open();

        await user.click(await screen.findByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.click(screen.getByRole("button", { name: "Send invitations" }));

        expect(await screen.findByText(/1 invitation sent for Retreat/)).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });
});
