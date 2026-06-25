import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateGroupChatModal } from "../components/CreateGroupChatModal";
import { renderWithConfig, mockFetch } from "./test-utils";

const event = { id: "evt-1", name: "Summer BBQ" };
const baseProps = (overrides: any = {}) => ({
  event,
  communityTag: "c-1",
  onClose: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

describe("CreateGroupChatModal", () => {
  it("creates an open chat by default and calls onCreated with the conversationId", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const fetchMock = mockFetch([
      { method: "POST", url: "/events/evt-1/group-chat", body: { conversationId: "conv-1", created: true } },
    ]);
    const props = baseProps({ onCreated });
    renderWithConfig(<CreateGroupChatModal {...props} />);

    await user.click(screen.getByRole("button", { name: /create group chat/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ conversationId: "conv-1", created: true }));
    expect(props.showToast).toHaveBeenCalledWith("Group chat created");
    // Default posting policy is open (announceOnly:false).
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as any).body);
    expect(body.announceOnly).toBe(false);
  });

  it("defaults large events to announce-only and posts announceOnly:true", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { method: "POST", url: "/events/evt-1/group-chat", body: { conversationId: "conv-2", created: true } },
    ]);
    renderWithConfig(<CreateGroupChatModal {...baseProps({ attendeeCount: 1200 })} />);

    // The large-event nudge is shown.
    expect(screen.getByText(/1,200 attendees/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /create group chat/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as any).body);
    expect(body.announceOnly).toBe(true);
  });

  it("says 'opened' when the chat already existed (idempotent created:false)", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    mockFetch([
      { method: "POST", url: "/events/evt-1/group-chat", body: { conversationId: "conv-1", created: false } },
    ]);
    renderWithConfig(<CreateGroupChatModal {...props} />);

    await user.click(screen.getByRole("button", { name: /create group chat/i }));

    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith("Group chat opened"));
  });
});
