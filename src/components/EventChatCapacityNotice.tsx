"use client";

import { useState } from "react";

const SOFT_THRESHOLD = 500;
const APPROACHING_RATIO = 0.9;

export interface EventChatCapacityNoticeProps {
  /** Active member count of the event's group chat. */
  memberCount: number;
  /** The chat's hard cap (conversations.maxMembers — ~5k for event chats). */
  maxMembers: number;
  /** Whether the chat is already announce-only (suppresses the noise nudge). */
  announceOnly: boolean;
  /**
   * Open the chat so the host can act (e.g. switch to announce-only in the
   * chat's group settings). The notice doesn't change settings itself.
   */
  onOpenChat?: () => void;
}

/**
 * Host-only capacity notices for an event group chat, shown on the admin event
 * overview. Two tiers (docs/features/event-group-chat.md "cap strategy"):
 *   - Soft threshold (~500): about NOISE — nudge toward announce-only. Skipped
 *     when already announce-only. Dismissible.
 *   - Approaching the hard cap (~90%): about CAPACITY — fires regardless of
 *     posting policy (an announce-only chat still fills up). Not dismissible.
 *   - At the cap: new attendees aren't auto-added.
 * Renders nothing when neither tier applies.
 */
export function EventChatCapacityNotice({
  memberCount, maxMembers, announceOnly, onOpenChat,
}: EventChatCapacityNoticeProps) {
  const [dismissed, setDismissed] = useState(false);

  const atCap = maxMembers > 0 && memberCount >= maxMembers;
  const approaching = maxMembers > 0 && !atCap && memberCount >= Math.floor(maxMembers * APPROACHING_RATIO);
  const noisy = !approaching && !atCap && memberCount >= SOFT_THRESHOLD && !announceOnly;

  if (atCap) {
    return (
      <Banner tone="red">
        <span>
          This chat is at capacity ({memberCount.toLocaleString()}/{maxMembers.toLocaleString()}).
          New attendees won&apos;t be added until it has room.
        </span>
      </Banner>
    );
  }

  if (approaching) {
    return (
      <Banner tone="amber">
        <span>
          This chat is nearing its {maxMembers.toLocaleString()}-member limit
          ({memberCount.toLocaleString()} so far). New attendees won&apos;t be added past it.
        </span>
      </Banner>
    );
  }

  if (noisy && !dismissed) {
    return (
      <Banner tone="amber" onDismiss={() => setDismissed(true)}>
        <span>
          This chat has {memberCount.toLocaleString()} members. Large open chats get noisy,
          so consider switching it to announce-only{onOpenChat ? " in the chat settings." : "."}
        </span>
        {onOpenChat && (
          <button onClick={onOpenChat} className="ml-2 underline font-medium cursor-pointer whitespace-nowrap">
            Open chat
          </button>
        )}
      </Banner>
    );
  }

  return null;
}

function Banner({ tone, children, onDismiss }: { tone: "amber" | "red"; children: React.ReactNode; onDismiss?: () => void }) {
  const cls = tone === "red"
    ? "bg-red-50 border-red-100 text-red-800"
    : "bg-amber-50 border-amber-100 text-amber-800";
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-[12px] ${cls}`}>
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer">×</button>
      )}
    </div>
  );
}
