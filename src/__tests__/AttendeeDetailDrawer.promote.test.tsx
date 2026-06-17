import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendeeDetailDrawer } from "../components/AttendeesAndInvitationsSection/AttendeeDetailDrawer";
import { renderWithConfig } from "./test-utils";

const attendee = {
    id: "att-1",
    userId: "u-1",
    name: "Alice",
    usertag: "alice",
    email: "alice@x.com",
    status: "APPROVED",
    tier: { id: "t-1", name: "Standard" },
};

describe("AttendeeDetailDrawer — promote-to-host action", () => {
    it("hides the action by default (no props set)", () => {
        renderWithConfig(<AttendeeDetailDrawer attendee={attendee} onClose={vi.fn()} />);
        expect(screen.queryByRole("button", { name: /promote to host/i })).not.toBeInTheDocument();
    });

    it("hides the action when canPromoteToHost is false", () => {
        renderWithConfig(
            <AttendeeDetailDrawer
                attendee={attendee}
                onClose={vi.fn()}
                canPromoteToHost={false}
                onPromoteToHost={vi.fn()}
            />,
        );
        expect(screen.queryByRole("button", { name: /promote to host/i })).not.toBeInTheDocument();
    });

    it("hides the action when canPromoteToHost is true but onPromoteToHost is missing", () => {
        renderWithConfig(
            <AttendeeDetailDrawer attendee={attendee} onClose={vi.fn()} canPromoteToHost={true} />,
        );
        expect(screen.queryByRole("button", { name: /promote to host/i })).not.toBeInTheDocument();
    });

    it("renders the action when both canPromoteToHost and onPromoteToHost are set", () => {
        renderWithConfig(
            <AttendeeDetailDrawer
                attendee={attendee}
                onClose={vi.fn()}
                canPromoteToHost={true}
                onPromoteToHost={vi.fn()}
            />,
        );
        expect(screen.getByRole("button", { name: /promote to host/i })).toBeInTheDocument();
        expect(screen.getByText(/payment is kept on file/i)).toBeInTheDocument();
    });

    it("clicking the action calls onPromoteToHost with the attendee and triggers the drawer close transition", async () => {
        const onPromoteToHost = vi.fn();
        const onClose = vi.fn();
        const user = userEvent.setup();
        renderWithConfig(
            <AttendeeDetailDrawer
                attendee={attendee}
                onClose={onClose}
                canPromoteToHost={true}
                onPromoteToHost={onPromoteToHost}
            />,
        );
        await user.click(screen.getByRole("button", { name: /promote to host/i }));
        expect(onPromoteToHost).toHaveBeenCalledWith(attendee);
    });
});
