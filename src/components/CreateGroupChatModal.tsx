"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useEventManagementConfig } from "../config";

/**
 * Soft threshold above which a large open chat gets noisy — we nudge the host
 * toward announce-only (and pre-select it). The hard cap (~5k) lives on the
 * backend (conversations.maxMembers for event chats). See
 * docs/features/event-group-chat.md "cap strategy".
 */
const SOFT_THRESHOLD = 500;

export interface CreateGroupChatModalProps {
  event: { id: string; name?: string };
  communityTag: string;
  onClose: () => void;
  showToast: (msg: string) => void;
  /**
   * Current approved-attendee count, if known. When it already exceeds the
   * soft threshold we pre-select announce-only and warn — a 1,000-person open
   * chat is chaos. Optional: omit to default to an open chat.
   */
  attendeeCount?: number;
  /**
   * Called when the chat is created (or already existed — the backend is
   * idempotent on eventId). Receives the conversation id so the consumer can
   * deep-link to it. The component does NOT navigate itself.
   */
  onCreated?: (result: { conversationId?: string; created?: boolean }) => void;
}

/**
 * Host-only "Create Group Chat" modal. Creates one GROUP conversation per event
 * (named after it); everyone who joins the event is auto-added by the backend.
 * The only choice here is the posting policy — open (everyone posts) vs
 * announce-only (hosts post, attendees read). Idempotent: re-creating returns
 * the existing chat.
 */
export function CreateGroupChatModal({
  event, communityTag, onClose, showToast, attendeeCount, onCreated,
}: CreateGroupChatModalProps) {
  const { apiBaseUrl, authHeaders } = useEventManagementConfig();
  const isLarge = typeof attendeeCount === "number" && attendeeCount >= SOFT_THRESHOLD;
  // Large events default to announce-only — the host can still flip it.
  const [announceOnly, setAnnounceOnly] = useState(isLarge);
  const [saving, setSaving] = useState(false);

  async function execute() {
    setSaving(true);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/group-chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ announceOnly }),
        },
      );
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.created === false ? "Group chat opened" : "Group chat created");
        onCreated?.({ conversationId: data.conversationId, created: data.created });
      } else {
        showToast("Failed to create group chat");
      }
    } catch {
      showToast("Failed to create group chat");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-2">Create group chat</h3>
      <p className="text-[13px] text-zinc-500 mb-4">
        Starts a group chat named &ldquo;{event.name || "this event"}&rdquo;. Everyone who joins
        the event &mdash; RSVPs, buys a ticket, or is added &mdash; is added to the chat
        automatically. You and your co-hosts are admins.
      </p>

      <div className="rounded-lg border border-zinc-200 divide-y divide-zinc-100 mb-4">
        <button
          type="button"
          onClick={() => setAnnounceOnly(false)}
          className="w-full flex items-start gap-3 p-3 text-left hover:bg-zinc-50 cursor-pointer"
        >
          <span className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${!announceOnly ? "border-zinc-900" : "border-zinc-300"}`}>
            {!announceOnly && <span className="w-2 h-2 rounded-full bg-zinc-900" />}
          </span>
          <span>
            <span className="block text-[13px] font-medium text-zinc-900">Open chat</span>
            <span className="block text-[12px] text-zinc-500">Everyone can post. Best for community and networking.</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setAnnounceOnly(true)}
          className="w-full flex items-start gap-3 p-3 text-left hover:bg-zinc-50 cursor-pointer"
        >
          <span className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${announceOnly ? "border-zinc-900" : "border-zinc-300"}`}>
            {announceOnly && <span className="w-2 h-2 rounded-full bg-zinc-900" />}
          </span>
          <span>
            <span className="block text-[13px] font-medium text-zinc-900">Announce only</span>
            <span className="block text-[12px] text-zinc-500">Only hosts post; attendees read. Lower noise.</span>
          </span>
        </button>
      </div>

      {isLarge && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 mb-4">
          <p className="text-[12px] text-amber-800">
            This event has {attendeeCount?.toLocaleString()} attendees. Large open chats get noisy fast &mdash;
            announce-only is recommended (you can change it later).
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
        <button onClick={execute} disabled={saving}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer">
          {saving ? "Creating..." : "Create group chat"}
        </button>
      </div>
    </ModalShell>
  );
}
