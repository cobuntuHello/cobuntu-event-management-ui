"use client";

import { useState, useRef, useEffect } from "react";
import { useEventManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";

/**
 * One row in the HostsManagementSection — a host with their avatar +
 * name + per-host action menu.
 *
 * Three visual states:
 *   - **Creator-locked** — for the immutable creator-host of a USER-owned
 *     event. Renders a "Creator 🔒" badge, no menu. Tooltip on hover
 *     explains "Receives payments from this event."
 *   - **Demote-able** — host has an existing event_attendance. Menu
 *     option is "Demote to attendee" (keeps their attendance + payment
 *     in place; they're "just attending" again).
 *   - **Removable** — host has no attendance. Menu option is "Remove
 *     from hosts" (clean host_row delete, no side effect).
 *
 * The smart label is consumer-facing: the BE classifies the action by
 * outcome regardless of which label was on the button — see
 * event_host_audits.action (REMOVED vs DEMOTED_TO_ATTENDEE).
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
}

interface Props {
    host: Host;
    /**
     * True when this is the creator-host of a USER-owned event
     * (event.communityId IS NULL AND host.userId === event.createdByUserId).
     * Renders the locked-creator chip — no menu, badge + tooltip.
     */
    isImmutableCreator: boolean;
    /**
     * True when the target user has an existing event_attendances row,
     * making the action a "demote" rather than a "remove" — different
     * label, same BE call.
     */
    hasAttendance: boolean;
    /** Whether the current user can manage hosts on this event. */
    canManage: boolean;
    onRemove: () => void;
}

export function HostChip({ host, isImmutableCreator, hasAttendance, canManage, onRemove }: Props) {
    const config = useEventManagementConfig();
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!menuOpen) return;
        function onClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        }
        function onEsc(e: KeyboardEvent) {
            if (e.key === "Escape") setMenuOpen(false);
        }
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onEsc);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onEsc);
        };
    }, [menuOpen]);

    return (
        <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-zinc-50 group">
            <UserAvatar user={host.user} className="w-9 h-9 shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-zinc-900 truncate">
                    {host.user.name || "Unknown"}
                </p>
                {host.user.usertag && (
                    <p className="text-[12px] text-zinc-500 truncate">@{host.user.usertag}</p>
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
                <div className="relative shrink-0" ref={menuRef}>
                    <button
                        onClick={() => setMenuOpen((v) => !v)}
                        aria-label="Host actions"
                        className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-500 cursor-pointer"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="5" r="1" />
                            <circle cx="12" cy="12" r="1" />
                            <circle cx="12" cy="19" r="1" />
                        </svg>
                    </button>
                    {menuOpen && (
                        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-zinc-200 bg-white shadow-lg py-1">
                            <button
                                onClick={() => {
                                    setMenuOpen(false);
                                    onRemove();
                                }}
                                className="w-full text-left px-3 py-2 text-[13px] text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                            >
                                {hasAttendance ? "Demote to attendee" : "Remove from hosts"}
                            </button>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}
