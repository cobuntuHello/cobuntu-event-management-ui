import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddAttendeesModal } from "../page/modals/AddAttendeesModal";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * Add people vs Send a gift (backend docs/features/add-vs-gift.md). The same
 * picker; a plain add says "Add", sends mode add, and keeps the host's note
 * private (internalNote). A gift is unchanged (covered by the guests test).
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

function postedBody(fetchMock: ReturnType<typeof vi.fn>) {
    const call = fetchMock.mock.calls.find(
        ([url, init]: any) => String(url).includes("/add-attendees") && init?.method === "POST",
    );
    return call ? JSON.parse((call[1] as RequestInit).body as string) : null;
}

describe("Add people (a plain add)", () => {
    it("is worded as an add, sends mode add, and the note goes to hosts only", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /add-attendees/, body: { added: 1, alreadyAttending: 0, failed: 0, failures: [] } },
        ]);
        renderWithConfig(
            <AddAttendeesModal
                mode="add"
                event={{ name: "Food for Thought", endDate: "2099-01-01T00:00:00.000Z", attendees: [] }}
                communityTag="c"
                eventId="evt-1"
                onUpdate={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        expect(await screen.findByText("Add people")).toBeTruthy();
        await screen.findByText("Ana Neto");
        await user.click(screen.getByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        expect(screen.getByText("Private note (optional)")).toBeTruthy();
        await user.type(screen.getByPlaceholderText(/Only hosts see this/), "Speaker");
        await user.click(screen.getByRole("button", { name: "Add" }));

        await waitFor(() => expect(postedBody(fetchMock)).toBeTruthy());
        const body = postedBody(fetchMock);
        expect(body.mode).toBe("add");
        expect(body.internalNote).toBe("Speaker");
        expect(body.customMessage).toBeUndefined();
        expect(await screen.findByText(/1 person added to Food for Thought/)).toBeTruthy();
    });

    it("a gift (the default) sends mode gift with the note for them", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            ROSTER, ...QUIET,
            { method: "POST", url: /add-attendees/, body: { added: 1, failures: [] } },
        ]);
        renderWithConfig(
            <AddAttendeesModal
                event={{ name: "Food for Thought", endDate: "2099-01-01T00:00:00.000Z", attendees: [] }}
                communityTag="c"
                eventId="evt-1"
                onUpdate={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        await screen.findByText("Ana Neto");
        await user.click(screen.getByText("Ana Neto"));
        await user.click(screen.getByRole("button", { name: "Write and preview" }));
        await user.type(screen.getByPlaceholderText(/Add a note/), "Enjoy");
        await user.click(screen.getByRole("button", { name: "Send gift" }));
        await waitFor(() => expect(postedBody(fetchMock)).toBeTruthy());
        expect(postedBody(fetchMock)).toMatchObject({ mode: "gift", customMessage: "Enjoy" });
        expect(postedBody(fetchMock).internalNote).toBeUndefined();
    });
});
