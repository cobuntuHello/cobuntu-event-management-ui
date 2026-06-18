import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromoteAttendeeModal } from "../components/PromoteAttendeeModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const eligible = [
    { id: "att-1", userId: "u-1", name: "Alice", usertag: "alice", email: "alice@x.com", status: "APPROVED", tier: { id: "t-1", name: "Standard" } },
    { id: "att-2", userId: "u-2", name: "Bob", usertag: "bob", email: "bob@x.com", status: "APPROVED" },
    { id: "att-3", userId: "u-3", name: "Carol", usertag: null, email: "carol@x.com", status: "APPROVED" },
];

const baseProps = (overrides: Record<string, unknown> = {}) => ({
    eventId: "evt-1",
    eligibleAttendees: eligible,
    open: true,
    onClose: vi.fn(),
    onPromoted: vi.fn(),
    ...overrides,
});

describe("PromoteAttendeeModal — picker mode", () => {
    it("does not render when open=false", () => {
        renderWithConfig(<PromoteAttendeeModal {...baseProps({ open: false })} />);
        expect(screen.queryByText(/promote attendee to host/i)).not.toBeInTheDocument();
    });

    it("renders the heading + helper copy when open", () => {
        renderWithConfig(<PromoteAttendeeModal {...baseProps()} />);
        expect(screen.getByText(/promote to host/i)).toBeInTheDocument();
        expect(screen.getByText(/pick a paid attendee/i)).toBeInTheDocument();
    });

    it("lists eligible attendees", () => {
        renderWithConfig(<PromoteAttendeeModal {...baseProps()} />);
        expect(screen.getByText("Alice")).toBeInTheDocument();
        expect(screen.getByText("Bob")).toBeInTheDocument();
        expect(screen.getByText("Carol")).toBeInTheDocument();
    });

    it("renders the tier badge when present", () => {
        renderWithConfig(<PromoteAttendeeModal {...baseProps()} />);
        expect(screen.getByText("Standard")).toBeInTheDocument();
    });

    it("shows empty-state when the eligible list is empty", () => {
        renderWithConfig(<PromoteAttendeeModal {...baseProps({ eligibleAttendees: [] })} />);
        expect(screen.getByText(/no paid attendees yet/i)).toBeInTheDocument();
    });

    it("filters the list by name", async () => {
        const user = userEvent.setup();
        renderWithConfig(<PromoteAttendeeModal {...baseProps()} />);
        const input = screen.getByPlaceholderText(/search by name/i);
        await user.type(input, "ali");
        expect(screen.getByText("Alice")).toBeInTheDocument();
        expect(screen.queryByText("Bob")).not.toBeInTheDocument();
        expect(screen.queryByText("Carol")).not.toBeInTheDocument();
    });

    it("filters the list by email", async () => {
        const user = userEvent.setup();
        renderWithConfig(<PromoteAttendeeModal {...baseProps()} />);
        const input = screen.getByPlaceholderText(/search by name/i);
        await user.type(input, "carol@");
        expect(screen.queryByText("Alice")).not.toBeInTheDocument();
        expect(screen.queryByText("Bob")).not.toBeInTheDocument();
        expect(screen.getByText("Carol")).toBeInTheDocument();
    });

    it("shows 'No matches' when search has zero hits", async () => {
        const user = userEvent.setup();
        renderWithConfig(<PromoteAttendeeModal {...baseProps()} />);
        await user.type(screen.getByPlaceholderText(/search by name/i), "zzz");
        expect(screen.getByText(/no matches/i)).toBeInTheDocument();
    });

    it("close icon fires onClose", async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        renderWithConfig(<PromoteAttendeeModal {...baseProps({ onClose })} />);
        await user.click(screen.getByLabelText("Close"));
        expect(onClose).toHaveBeenCalled();
    });

    it("picking an attendee advances to the confirm step with Back + Promote", async () => {
        const user = userEvent.setup();
        renderWithConfig(<PromoteAttendeeModal {...baseProps()} />);
        await user.click(screen.getByText("Alice"));
        expect(screen.getByText(/they'll be listed as a host/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /promote to host/i })).toBeInTheDocument();
    });

    it("Back returns to the picker", async () => {
        const user = userEvent.setup();
        renderWithConfig(<PromoteAttendeeModal {...baseProps()} />);
        await user.click(screen.getByText("Alice"));
        await user.click(screen.getByRole("button", { name: /back/i }));
        expect(screen.getByPlaceholderText(/search by name/i)).toBeInTheDocument();
    });
});

describe("PromoteAttendeeModal — confirm + API", () => {
    it("POSTs to /api/events/:id/hosts with coHostUserId and calls onPromoted", async () => {
        const user = userEvent.setup();
        const onPromoted = vi.fn();
        const onClose = vi.fn();
        const fetchMock = mockFetch([
            { method: "POST", url: "/api/events/evt-1/hosts", status: 200, body: { id: "host-1" } },
        ]);
        renderWithConfig(<PromoteAttendeeModal {...baseProps({ onPromoted, onClose })} />);
        await user.click(screen.getByText("Alice"));
        await user.click(screen.getByRole("button", { name: /promote to host/i }));
        await waitFor(() => expect(onPromoted).toHaveBeenCalled());
        expect(onClose).toHaveBeenCalled();
        const call = fetchMock.mock.calls[0];
        expect(call[0]).toBe("http://api.test/api/events/evt-1/hosts");
        expect(call[1].method).toBe("POST");
        expect(JSON.parse(call[1].body)).toEqual({ coHostUserId: "u-1" });
        expect(call[1].headers.Authorization).toBe("Bearer test-token");
    });

    it("falls back to nested user.id when top-level userId is missing", async () => {
        // BE's normalizeAttendees shape: { userId: null, user: { id: ... } }.
        // Regression for PBN W35 FK violation 2026-06-18 — promoting
        // someone with { id: 'attendance-uuid', userId: null } was sending
        // the attendance UUID as userId, hitting event_hosts_userId_fkey.
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            { method: "POST", url: "/api/events/evt-1/hosts", status: 200, body: {} },
        ]);
        const nestedUserId = [
            { id: "attendance-uuid", userId: null, name: "Nested", status: "APPROVED", user: { id: "u-99", name: "Nested" } } as any,
        ];
        renderWithConfig(<PromoteAttendeeModal {...baseProps({ eligibleAttendees: nestedUserId })} />);
        await user.click(screen.getByText("Nested"));
        await user.click(screen.getByRole("button", { name: /promote to host/i }));
        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalled();
        });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ coHostUserId: "u-99" });
    });

    it("errors out (no API call) when neither userId nor user.id is present", async () => {
        const user = userEvent.setup();
        const fetchMock = mockFetch([
            { method: "POST", url: "/api/events/evt-1/hosts", status: 200, body: {} },
        ]);
        const noUserId = [{ id: "attendance-uuid", name: "Guest only", status: "APPROVED" } as any];
        renderWithConfig(<PromoteAttendeeModal {...baseProps({ eligibleAttendees: noUserId })} />);
        await user.click(screen.getByText("Guest only"));
        await user.click(screen.getByRole("button", { name: /promote to host/i }));
        await waitFor(() => {
            expect(screen.getByText(/no linked user account/i)).toBeInTheDocument();
        });
        expect(fetchMock.mock.calls.length).toBe(0);
    });

    it("surfaces 'already a host' on 409", async () => {
        const user = userEvent.setup();
        const onPromoted = vi.fn();
        mockFetch([
            { method: "POST", url: "/api/events/evt-1/hosts", status: 409, body: { error: "exists" } },
        ]);
        renderWithConfig(<PromoteAttendeeModal {...baseProps({ onPromoted })} />);
        await user.click(screen.getByText("Alice"));
        await user.click(screen.getByRole("button", { name: /promote to host/i }));
        await waitFor(() => {
            expect(screen.getByText(/already a host/i)).toBeInTheDocument();
        });
        expect(onPromoted).not.toHaveBeenCalled();
    });

    it("surfaces 'only creator' on 403", async () => {
        const user = userEvent.setup();
        const onPromoted = vi.fn();
        mockFetch([
            { method: "POST", url: "/api/events/evt-1/hosts", status: 403, body: { error: "forbidden" } },
        ]);
        renderWithConfig(<PromoteAttendeeModal {...baseProps({ onPromoted })} />);
        await user.click(screen.getByText("Alice"));
        await user.click(screen.getByRole("button", { name: /promote to host/i }));
        await waitFor(() => {
            expect(screen.getByText(/only the event creator/i)).toBeInTheDocument();
        });
        expect(onPromoted).not.toHaveBeenCalled();
    });

    it("surfaces backend error message on other failures", async () => {
        const user = userEvent.setup();
        mockFetch([
            { method: "POST", url: "/api/events/evt-1/hosts", status: 500, body: { message: "Boom" } },
        ]);
        renderWithConfig(<PromoteAttendeeModal {...baseProps()} />);
        await user.click(screen.getByText("Alice"));
        await user.click(screen.getByRole("button", { name: /promote to host/i }));
        await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());
    });
});

describe("PromoteAttendeeModal — preselected mode", () => {
    it("skips the picker and shows the confirm view directly", () => {
        renderWithConfig(
            <PromoteAttendeeModal {...baseProps({ preselected: eligible[1] })} />,
        );
        expect(screen.queryByPlaceholderText(/search by name/i)).not.toBeInTheDocument();
        expect(screen.getByText("Bob")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /promote to host/i })).toBeInTheDocument();
    });

    it("renders Cancel (not Back) when preselected", () => {
        renderWithConfig(
            <PromoteAttendeeModal {...baseProps({ preselected: eligible[1] })} />,
        );
        expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
    });

    it("Cancel fires onClose", async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        renderWithConfig(
            <PromoteAttendeeModal {...baseProps({ preselected: eligible[1], onClose })} />,
        );
        await user.click(screen.getByRole("button", { name: /cancel/i }));
        expect(onClose).toHaveBeenCalled();
    });
});
