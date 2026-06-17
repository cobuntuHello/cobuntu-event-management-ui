"use client";

import { useEffect, useMemo, useState } from "react";
import { useEventManagementConfig } from "../config";
import { UserAvatarFallback } from "../ui/user-avatar-fallback";
import { AttendeesActionModalShell } from "./attendees-action/AttendeesActionModalShell";

type Attendee = {
    id: string;
    userId?: string | null;
    name?: string;
    firstName?: string;
    /** Nullable because BE-returned guest-attendances have no usertag. */
    usertag?: string | null;
    email?: string | null;
    profileImage?: string | null;
    status?: string | null;
    tier?: { id: string; name: string } | null;
};

export interface PromoteAttendeeModalProps {
    eventId: string;
    /**
     * The list of attendees eligible to be promoted. The consumer is
     * responsible for filtering — typical filter is APPROVED + paid +
     * not-already-a-host. The modal renders this list verbatim.
     */
    eligibleAttendees: Attendee[];
    /**
     * When set, skips the picker and jumps directly to the confirm
     * screen for this attendee. Used when the promote action is
     * launched from the per-attendee drawer (the user already chose).
     */
    preselected?: Attendee | null;
    open: boolean;
    onClose: () => void;
    /**
     * Fired after a successful POST. The consumer should refresh its
     * hosts list (and optionally show a toast).
     */
    onPromoted: (attendee: Attendee) => void;
}

/**
 * Promote-attendee-to-host modal — restructured 2026-06-17 to ride on
 * the shared `attendees-action/` primitives (same `AttendeesActionModalShell`
 * used by admin's redesigned Add + Invite modals), so all event-host
 * actions render with one visual language.
 *
 * Posts to `/api/events/:eventId/hosts` with `{ coHostUserId }`. Backed
 * by `HostService.addCoHost` which is idempotent on the
 * `(eventId, userId)` unique constraint (HTTP 409 surfaces "already a
 * host"; the consumer's refresh reconciles).
 *
 * Differs from the legacy "Add host" path (which searches all users +
 * bypasses payment). This flow promotes an *attendee* who already paid,
 * so the host displays as host AND the original payment is kept on
 * file — the client's "everyone pays" requirement.
 *
 * Two states inside the same shell:
 *   - picker  → search + tap-to-select from the eligible list
 *   - confirm → selected attendee card + Promote CTA in the footer
 * Preselected callers skip the picker.
 */
export function PromoteAttendeeModal({
    eventId,
    eligibleAttendees,
    preselected,
    open,
    onClose,
    onPromoted,
}: PromoteAttendeeModalProps) {
    const config = useEventManagementConfig();
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;
    const [picked, setPicked] = useState<Attendee | null>(null);
    const [query, setQuery] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setPicked(preselected ?? null);
            setQuery("");
            setError(null);
        }
    }, [open, preselected?.id]);

    const filtered = useMemo(() => {
        if (!query.trim()) return eligibleAttendees;
        const q = query.trim().toLowerCase();
        return eligibleAttendees.filter((a) => {
            const hay = `${a.name || ""} ${a.usertag || ""} ${a.email || ""}`.toLowerCase();
            return hay.includes(q);
        });
    }, [query, eligibleAttendees]);

    async function confirm() {
        if (!picked) return;
        const userId = picked.userId || picked.id;
        if (!userId) {
            setError("This attendee has no linked user account yet.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`${config.apiBaseUrl}/api/events/${eventId}/hosts`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...config.authHeaders() },
                body: JSON.stringify({ coHostUserId: userId }),
            });
            if (!res.ok) {
                if (res.status === 409) {
                    setError("This person is already a host.");
                } else if (res.status === 403) {
                    setError("Only the event creator can promote attendees to host.");
                } else {
                    const body = await res.json().catch(() => null);
                    setError(body?.message || `Failed (${res.status})`);
                }
                return;
            }
            onPromoted(picked);
            onClose();
        } catch (e: any) {
            setError(e?.message || "Network error");
        } finally {
            setSubmitting(false);
        }
    }

    const subtitle = picked
        ? "They'll be listed as a host. Their existing registration and payment stay on file."
        : "Pick a paid attendee. Their registration stays in place; they'll be added as a host.";

    return (
        <AttendeesActionModalShell
            isOpen={open}
            onClose={onClose}
            title="Promote to host"
            subtitle={subtitle}
            unsavedCount={picked && !preselected ? 1 : 0}
            footer={
                <div className="flex items-center justify-between gap-3">
                    {picked ? (
                        <>
                            {!preselected ? (
                                <button
                                    onClick={() => setPicked(null)}
                                    disabled={submitting}
                                    className="hidden sm:inline-flex px-4 py-2.5 text-[13px] text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer disabled:opacity-50"
                                >
                                    Back
                                </button>
                            ) : (
                                <button
                                    onClick={onClose}
                                    disabled={submitting}
                                    className="hidden sm:inline-flex px-4 py-2.5 text-[13px] text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                onClick={confirm}
                                disabled={submitting}
                                className="flex-1 sm:flex-none px-5 py-2.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                                {submitting ? "Promoting…" : "Promote to host"}
                            </button>
                        </>
                    ) : (
                        <>
                            <span className="text-[13px] text-zinc-500 hidden sm:inline">
                                {eligibleAttendees.length === 0
                                    ? "No eligible attendees yet"
                                    : `${eligibleAttendees.length} eligible`}
                            </span>
                            <button
                                onClick={onClose}
                                className="px-4 py-2.5 text-[13px] text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer ml-auto"
                            >
                                Cancel
                            </button>
                        </>
                    )}
                </div>
            }
        >
            <div className="px-5 sm:px-6 py-5">
                {picked ? (
                    /* Confirm step */
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 bg-zinc-50">
                            <UserAvatar
                                user={{
                                    name: picked.name,
                                    usertag: picked.usertag,
                                    email: picked.email || undefined,
                                    profileImage: picked.profileImage || undefined,
                                    id: picked.id,
                                }}
                                className="w-12 h-12"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="text-[14px] font-semibold text-zinc-900 truncate">{picked.name || "Unknown"}</p>
                                {picked.usertag && <p className="text-[12px] text-zinc-500 truncate">@{picked.usertag}</p>}
                                {picked.tier?.name && (
                                    <span className="inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                                        {picked.tier.name}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-3 text-[12px] text-zinc-600 leading-relaxed">
                            <p className="font-medium text-zinc-800 mb-1">What happens next</p>
                            <ul className="space-y-1 list-disc list-inside [&>li]:pl-0">
                                <li>They appear in the hosts list and can manage the event.</li>
                                <li>Their existing registration is unchanged.</li>
                                <li>Any payment they made stays on file.</li>
                            </ul>
                        </div>

                        {error && (
                            <p className="text-[12px] text-red-600">{error}</p>
                        )}
                    </div>
                ) : (
                    /* Picker step */
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 shrink-0">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by name, handle, or email"
                                className="flex-1 min-w-0 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none bg-transparent"
                            />
                        </div>

                        <div className="rounded-xl border border-zinc-100 divide-y divide-zinc-100 max-h-[380px] overflow-y-auto">
                            {filtered.length === 0 ? (
                                <p className="px-4 py-8 text-center text-[12px] text-zinc-400">
                                    {eligibleAttendees.length === 0 ? "No paid attendees yet." : "No matches."}
                                </p>
                            ) : (
                                filtered.map((a) => (
                                    <button
                                        key={a.id}
                                        onClick={() => setPicked(a)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 text-left cursor-pointer"
                                    >
                                        <UserAvatar
                                            user={{
                                                name: a.name,
                                                usertag: a.usertag,
                                                email: a.email || undefined,
                                                profileImage: a.profileImage || undefined,
                                                id: a.id,
                                            }}
                                            className="w-8 h-8 shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13px] font-medium text-zinc-900 truncate">{a.name || "Unknown"}</p>
                                            {a.usertag ? (
                                                <p className="text-[11px] text-zinc-400 truncate">@{a.usertag}</p>
                                            ) : a.email ? (
                                                <p className="text-[11px] text-zinc-400 truncate">{a.email}</p>
                                            ) : null}
                                        </div>
                                        {a.tier?.name && (
                                            <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded shrink-0">
                                                {a.tier.name}
                                            </span>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>

                        {error && (
                            <p className="text-[12px] text-red-600">{error}</p>
                        )}
                    </div>
                )}
            </div>
        </AttendeesActionModalShell>
    );
}
