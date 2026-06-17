import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddMemberAsHostModal } from "../components/hosts/AddMemberAsHostModal";
import { renderWithConfig, mockFetch } from "./test-utils";

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

    it("shows the prompt to start typing when query is empty", () => {
        mockFetch([]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        expect(screen.getByText(/start typing to search/i)).toBeInTheDocument();
    });

    it("debounces and calls the BE search endpoint with q + excludeUserIds", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            { method: "GET", url: /\/members\/search\?/, body: { members: [{ id: "u-2", name: "Beth", usertag: "beth", profileImage: null }] } },
        ]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        await user.type(screen.getByPlaceholderText(/search by name/i), "be");
        await waitFor(() => expect(screen.getByText("Beth")).toBeInTheDocument());

        const calls = (fetchMock as any).mock.calls.filter((c: any[]) => /\/members\/search\?/.test(c[0]));
        expect(calls.length).toBeGreaterThanOrEqual(1);
        const lastUrl = String(calls[calls.length - 1][0]);
        expect(lastUrl).toMatch(/q=be/);
        expect(lastUrl).toMatch(/excludeUserIds=u-existing-host/);
    });

    it("shows 'No matches.' when the BE returns an empty list", async () => {
        const user = userEvent.setup();
        mockFetch([
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
            { method: "GET", url: /\/members\/search\?/, body: { members: [{ id: "u-2", name: "Beth", usertag: "beth", profileImage: null }] } },
        ]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        await user.type(screen.getByPlaceholderText(/search by name/i), "be");
        await waitFor(() => expect(screen.getByText("Beth")).toBeInTheDocument());
        await user.click(screen.getByText("Beth"));
        expect(await screen.findByText(/what happens next/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /add as host/i })).toBeInTheDocument();
    });

    it("POSTs { userId } to /events/:id/hosts and calls onAdded on success", async () => {
        const user = userEvent.setup();
        const onAdded = vi.fn();
        const onClose = vi.fn();
        const fetchMock = mockFetch([
            { method: "GET", url: /\/members\/search\?/, body: { members: [{ id: "u-2", name: "Beth", usertag: "beth", profileImage: null }] } },
            { method: "POST", url: /\/events\/evt-1\/hosts$/, status: 201, body: { id: "h-2", userId: "u-2" } },
        ]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps({ onAdded, onClose })} />);
        await user.type(screen.getByPlaceholderText(/search by name/i), "be");
        await user.click(await screen.findByText("Beth"));
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
            { method: "GET", url: /\/members\/search\?/, body: { members: [{ id: "u-2", name: "Beth", usertag: "beth", profileImage: null }] } },
            { method: "POST", url: /\/events\/evt-1\/hosts$/, status: 409, body: { code: "ALREADY_HOST" } },
        ]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        await user.type(screen.getByPlaceholderText(/search by name/i), "be");
        await user.click(await screen.findByText("Beth"));
        await user.click(screen.getByRole("button", { name: /add as host/i }));

        await waitFor(() =>
            expect(screen.getByText(/this person is already a host/i)).toBeInTheDocument(),
        );
    });

    it("surfaces a friendly message on 403", async () => {
        const user = userEvent.setup();
        mockFetch([
            { method: "GET", url: /\/members\/search\?/, body: { members: [{ id: "u-2", name: "Beth", usertag: "beth", profileImage: null }] } },
            { method: "POST", url: /\/events\/evt-1\/hosts$/, status: 403, body: { error: "no perm" } },
        ]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        await user.type(screen.getByPlaceholderText(/search by name/i), "be");
        await user.click(await screen.findByText("Beth"));
        await user.click(screen.getByRole("button", { name: /add as host/i }));

        await waitFor(() =>
            expect(screen.getByText(/don't have permission/i)).toBeInTheDocument(),
        );
    });

    it("Back button returns to the picker without losing the search query", async () => {
        const user = userEvent.setup();
        mockFetch([
            { method: "GET", url: /\/members\/search\?/, body: { members: [{ id: "u-2", name: "Beth", usertag: "beth", profileImage: null }] } },
        ]);
        renderWithConfig(<AddMemberAsHostModal {...baseProps()} />);
        await user.type(screen.getByPlaceholderText(/search by name/i), "be");
        await user.click(await screen.findByText("Beth"));
        await user.click(screen.getByRole("button", { name: /back/i }));

        // Picker is visible again with the same query.
        expect((screen.getByPlaceholderText(/search by name/i) as HTMLInputElement).value).toBe("be");
    });
});
