"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useEventManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";

/**
 * Confirms a host removal with dynamic, context-aware copy.
 *
 * Two visual variants, picked by `hasAttendance`:
 *   - **Demote to attendee** (has attendance) — soft action; their
 *     event registration + payment stay on file.
 *   - **Remove from hosts** (no attendance) — clean host_row delete.
 *
 * Dynamic warnings:
 *   - When the target STILL holds EVENTS_MANAGE_LISTINGS in the event's
 *     linked community, the removal is largely aesthetic: they keep
 *     management rights via the role. Tells the operator so they don't
 *     mistake the BE 200 for a security change.
 *   - When the target is the operator themselves, the warning rephrases
 *     in the second person ("You'll still be able to manage…").
 *   - When they don't hold the role, the modal is a plain confirm.
 *
 * Replaces the legacy "..." popover + ConfirmDialog combo from admin's
 * pre-v2 HostsView. Same surface for both admin + community-app.
 */

export interface ConfirmRemoveHostModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    submitting?: boolean;
    /** The host being removed. */
    target: {
        userId: string;
        user: {
            name?: string | null;
            usertag?: string | null;
            profileImage?: string | null;
            email?: string | null;
            id?: string | null;
        };
        /** True when the target has an existing event_attendances row. */
        hasAttendance: boolean;
        /** True when the target also holds EVENTS_MANAGE_LISTINGS in the event's community. */
        hasManageEventsRole: boolean;
    };
    /** True when target.userId === currentUserId (operator is removing themselves). */
    isSelf: boolean;
    /** Used by the dynamic warning copy ("…in PBN"). */
    communityName?: string;
}

export function ConfirmRemoveHostModal({
    open,
    onClose,
    onConfirm,
    submitting,
    target,
    isSelf,
    communityName,
}: ConfirmRemoveHostModalProps) {
    const config = useEventManagementConfig();
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;

    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape" && !submitting) onClose();
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, submitting, onClose]);

    if (!open) return null;

    const action = target.hasAttendance ? "Demote to attendee" : "Remove from hosts";
    const title = target.hasAttendance
        ? `Demote ${target.user.name || "this host"} to attendee?`
        : `Remove ${target.user.name || "this host"} from hosts?`;
    const baseExplanation = target.hasAttendance
        ? "They'll stop being a host but their event registration and any payment stay on file."
        : "Their host status will be deleted. No registration or payment changes — they were never an attendee.";

    // The "aesthetic-only" warning. Composed in two voices depending on
    // whether the operator is removing themselves or someone else.
    const roleWarning = target.hasManageEventsRole
        ? isSelf
            ? `You'll still be able to manage this event after removing yourself because you hold the manage-events role${communityName ? ` in ${communityName}` : ""}. This removal is mostly aesthetic — you remain in control.`
            : `${target.user.name || "They"} will still be able to manage this event because they hold the manage-events role${communityName ? ` in ${communityName}` : ""}. This removal is mostly aesthetic — they remain in control.`
        : null;

    // Portal to document.body so the fixed backdrop escapes any
    // ancestor stacking-context (transforms / will-change / contain on
    // admin's sidebar layout would otherwise clip `fixed inset-0` to
    // the main content column, leaving the sidebar + top nav punched
    // through the overlay — surfaced 2026-06-18 on PBN W35).
    if (typeof document === "undefined") return null;

    const modal = (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
            onClick={() => { if (!submitting) onClose(); }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-remove-title"
            >
                <div className="px-6 pt-6 pb-2 flex flex-col items-center text-center">
                    <UserAvatar user={target.user} className="w-14 h-14 mb-3" />
                    <h2 id="confirm-remove-title" className="text-[15px] font-semibold text-zinc-900 mb-1.5">
                        {title}
                    </h2>
                    {target.user.usertag && (
                        <p className="text-[12px] text-zinc-400">@{target.user.usertag}</p>
                    )}
                </div>

                <div className="px-6 py-4 space-y-3">
                    <p className="text-[13px] text-zinc-600 leading-relaxed">{baseExplanation}</p>

                    {roleWarning && (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex gap-2.5">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600 shrink-0 mt-0.5">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <p className="text-[12px] text-amber-900 leading-relaxed">{roleWarning}</p>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-zinc-100 flex items-center justify-end gap-2">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2 text-[13px] font-medium text-zinc-600 rounded-lg hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={submitting}
                        className="px-4 py-2 text-[13px] font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? "Removing…" : action}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}
