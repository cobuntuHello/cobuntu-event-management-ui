"use client";

import { useEventManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";

/**
 * One row in the HostsManagementSection — avatar + name + a single
 * inline action button (no popover, no "..." menu).
 *
 * Three visual states:
 *   - **Creator-locked** — immutable creator-host of a USER-owned event
 *     (event.communityId IS NULL AND host.userId === event.createdByUserId).
 *     Renders a "Creator 🔒" badge with a tooltip, no action button.
 *   - **Demote-able** — host has an existing event_attendance. Inline
 *     button reads "Demote to attendee" — keeps their attendance +
 *     payment in place.
 *   - **Removable** — host has no attendance. Inline button reads
 *     "Remove" — clean host_row delete.
 *
 * Click on the action surfaces the ConfirmRemoveHostModal where the
 * operator confirms; this component never issues the DELETE itself.
 *
 * 2026-06-18 redesign: replaced the "..." kebab + popover with an
 * always-visible inline button. The kebab pattern was the wrong
 * affordance for a row that only ever has one action.
 */

export interface Host {
    id: string;
    userId: string;
    role?: string;
    user: {
        id: string;
        name?: string | null;
        usertag?: string | null;
        profileImage?: string | null;
        email?: string | null;
    };
    hasManageEventsRole?: boolean;
}

interface Props {
    host: Host;
    isImmutableCreator: boolean;
    hasAttendance: boolean;
    canManage: boolean;
    onRequestRemove: () => void;
}

export function HostChip({ host, isImmutableCreator, hasAttendance, canManage, onRequestRemove }: Props) {
    const config = useEventManagementConfig();
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;

    return (
        <div className="flex items-center gap-3 px-6 py-3.5 hover:bg-zinc-50/60 transition-colors">
            <UserAvatar user={host.user} className="w-10 h-10 shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-800 truncate">
                    {host.user.name || "Unknown"}
                </p>
                {host.user.usertag && (
                    <p className="text-[11px] text-zinc-400 truncate">@{host.user.usertag}</p>
                )}
            </div>

            {isImmutableCreator ? (
                <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0"
                    title="Receives payments from this event"
                >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Creator
                </span>
            ) : canManage ? (
                <button
                    onClick={onRequestRemove}
                    className="text-[12px] font-medium text-zinc-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors shrink-0"
                >
                    {hasAttendance ? "Demote to attendee" : "Remove"}
                </button>
            ) : null}
        </div>
    );
}
