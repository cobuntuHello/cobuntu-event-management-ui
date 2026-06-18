"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEventManagementConfig } from "../../config";
import { HostChip, type Host } from "./HostChip";
import { AddMemberAsHostModal } from "./AddMemberAsHostModal";
import { ConfirmRemoveHostModal } from "./ConfirmRemoveHostModal";
import { PromoteAttendeeModal } from "../PromoteAttendeeModal";

/**
 * Single shared host-management surface used by admin + community-app.
 *
 * Header pattern mirrors `AttendeesAndInvitationsSection`:
 *   - Left: "Hosts" title + a short subtitle.
 *   - Right: action buttons inline ("Promote attendee" ghost,
 *     "Add member" primary). Hidden when canManage=false or the
 *     event is past. Hidden Promote button when there are no
 *     eligible attendees.
 *
 * Below: the hosts list as clean rows (no popover, no kebab menu).
 * Each row's single action ("Demote to attendee" / "Remove") opens a
 * ConfirmRemoveHostModal with dynamic, context-aware copy:
 *   - If the target also holds EVENTS_MANAGE_LISTINGS in the event's
 *     linked community, the modal explains the removal is largely
 *     aesthetic (they keep management via the role).
 *   - If the operator is removing themselves, the warning rephrases
 *     in the second person.
 *
 * Creator-immutability is enforced both in the UI (locked creator
 * chip on user-owned events) and on the BE (DELETE returns 403
 * EVENT_CREATOR_IMMUTABLE).
 *
 * 2026-06-18 redesign — addresses:
 *   - "..." kebab menu was the wrong affordance for single-action rows.
 *   - Action buttons were at the BOTTOM of the section, inconsistent
 *     with admin's Attendees tab pattern (Add/Invite live in the header).
 *   - There was no confirmation step — clicks went straight to DELETE.
 *   - The operator had no way to know whether their own removal would
 *     actually take away their access (it usually doesn't, given the
 *     role grants management without requiring a host_row).
 */

export interface HostsManagementSectionProps {
    event: {
        id: string;
        /** NULL = user-owned event (creator immutable). NOT NULL = community-owned. */
        communityId: string | null;
        createdByUserId: string;
        endDate?: string | Date | null;
    };
    communityTag: string;
    /** Display name of the linked community ("PBN | Porto Business Network"). Used in the confirm-removal warning. */
    communityName?: string;
    /** Whether the current user can mutate (is_host OR EVENTS_MANAGE_LISTINGS). */
    canManage: boolean;
    /** The signed-in user's id. Used to detect self-removal so the modal warning rephrases. */
    currentUserId?: string;
    /**
     * Optional override for the list of paid attendees eligible to be
     * promoted to host. If omitted, the section fetches its own list.
     */
    eligibleAttendees?: PromoteEligibleAttendee[];
}

export interface PromoteEligibleAttendee {
    id: string;
    userId?: string | null;
    name?: string;
    usertag?: string | null;
    email?: string | null;
    profileImage?: string | null;
    tier?: { id: string; name: string } | null;
}

interface Attendee {
    id: string;
    userId: string | null;
    status: string;
    user?: { id: string; name?: string | null; usertag?: string | null; profileImage?: string | null; email?: string | null };
}

export function HostsManagementSection({
    event,
    communityTag,
    communityName,
    canManage,
    currentUserId,
    eligibleAttendees: eligibleAttendeesProp,
}: HostsManagementSectionProps) {
    const config = useEventManagementConfig();
    const [hosts, setHosts] = useState<Host[]>([]);
    const [attendees, setAttendees] = useState<Attendee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [promoteOpen, setPromoteOpen] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState<Host | null>(null);
    const [removeSubmitting, setRemoveSubmitting] = useState(false);

    const isUserOwned = event.communityId === null;
    const isPastEvent = useMemo(() => {
        if (!event.endDate) return false;
        return new Date(event.endDate) < new Date();
    }, [event.endDate]);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const headers = config.authHeaders();
            const [hostsRes, attendeesRes] = await Promise.all([
                fetch(`${config.apiBaseUrl}/api/events/${event.id}/hosts`, { headers }),
                fetch(`${config.apiBaseUrl}/api/events/${event.id}/attendees`, { headers }).catch(() => null),
            ]);
            if (!hostsRes.ok) throw new Error("Failed to load hosts");
            const hostsData = await hostsRes.json();
            setHosts(Array.isArray(hostsData) ? hostsData : hostsData?.hosts || []);
            if (attendeesRes?.ok) {
                const aData = await attendeesRes.json();
                const raw = Array.isArray(aData) ? aData : aData?.attendees || [];
                setAttendees(raw);
            }
        } catch (e: any) {
            setError(e?.message || "Failed to load hosts");
        } finally {
            setLoading(false);
        }
    }, [event.id, config]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const hostUserIds = useMemo(() => hosts.map((h) => h.userId), [hosts]);

    const attendanceByUserId = useMemo(() => {
        const m = new Map<string, Attendee>();
        for (const a of attendees) {
            if (a.userId) m.set(a.userId, a);
        }
        return m;
    }, [attendees]);

    const eligibleAttendees: PromoteEligibleAttendee[] = useMemo(() => {
        if (eligibleAttendeesProp) return eligibleAttendeesProp;
        const hostUserIdSet = new Set(hostUserIds);
        return attendees
            .filter((a) => a.status === "APPROVED" && a.userId && !hostUserIdSet.has(a.userId))
            .map((a) => ({
                id: a.id,
                userId: a.userId,
                name: a.user?.name || "Unknown",
                usertag: a.user?.usertag || undefined,
                email: a.user?.email || undefined,
                profileImage: a.user?.profileImage || undefined,
            }));
    }, [eligibleAttendeesProp, attendees, hostUserIds]);

    async function performRemove(host: Host) {
        setRemoveSubmitting(true);
        // Optimistic: drop the chip immediately. Restore on error.
        const before = hosts;
        setHosts((curr) => curr.filter((h) => h.id !== host.id));
        try {
            const res = await fetch(
                `${config.apiBaseUrl}/api/events/${event.id}/hosts/${host.userId}`,
                { method: "DELETE", headers: config.authHeaders() },
            );
            if (!res.ok) {
                setHosts(before);
                const body = await res.json().catch(() => null);
                if (res.status === 403 && body?.code === "EVENT_CREATOR_IMMUTABLE") {
                    setError("The event creator can't be removed because they receive the payments.");
                } else {
                    setError(body?.error || body?.message || `Failed to remove host (${res.status})`);
                }
                return;
            }
            // Pull fresh — attendances may have flipped (demote keeps the row).
            void refresh();
        } catch (e: any) {
            setHosts(before);
            setError(e?.message || "Failed to remove host");
        } finally {
            setRemoveSubmitting(false);
            setConfirmRemove(null);
        }
    }

    const showActionButtons = canManage && !isPastEvent;

    return (
        <section>
            {/* Header — mirrors AttendeesAndInvitationsSection */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
                <div className="flex-1">
                    <h2 className="text-[15px] font-semibold text-zinc-900">Hosts</h2>
                    <p className="text-[12px] text-zinc-400 mt-0.5">
                        People who can manage this event.
                        {isUserOwned && " The creator is immutable."}
                    </p>
                </div>
                {showActionButtons && (
                    <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                        {eligibleAttendees.length > 0 && (
                            <button
                                onClick={() => setPromoteOpen(true)}
                                className="flex-1 sm:flex-none px-4 py-2 text-[13px] font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
                            >
                                Promote attendee
                            </button>
                        )}
                        <button
                            onClick={() => setAddOpen(true)}
                            className="flex-1 sm:flex-none px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                        >
                            Add member
                        </button>
                    </div>
                )}
            </div>

            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
                {loading ? (
                    <p className="px-6 py-12 text-center text-[12px] text-zinc-400">Loading hosts…</p>
                ) : hosts.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-zinc-200 mb-3">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <p className="text-sm text-zinc-500">No hosts assigned</p>
                        <p className="text-xs text-zinc-400 mt-1">
                            {isUserOwned
                                ? "This event needs a creator-host."
                                : "Anyone with the manage-events role can still manage it."}
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-zinc-100">
                        {hosts.map((h) => {
                            const isImmutableCreator =
                                isUserOwned && h.userId === event.createdByUserId;
                            const hasAttendance = attendanceByUserId.has(h.userId);
                            return (
                                <li key={h.id}>
                                    <HostChip
                                        host={h}
                                        isImmutableCreator={isImmutableCreator}
                                        hasAttendance={hasAttendance}
                                        canManage={canManage && !isPastEvent}
                                        onRequestRemove={() => setConfirmRemove(h)}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {error && (
                <p className="mt-3 text-[12px] text-red-600">{error}</p>
            )}

            <AddMemberAsHostModal
                eventId={event.id}
                communityTag={communityTag}
                excludeUserIds={hostUserIds}
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onAdded={() => {
                    setAddOpen(false);
                    void refresh();
                }}
            />

            <PromoteAttendeeModal
                eventId={event.id}
                eligibleAttendees={eligibleAttendees as any}
                open={promoteOpen}
                onClose={() => setPromoteOpen(false)}
                onPromoted={() => {
                    setPromoteOpen(false);
                    void refresh();
                }}
            />

            {confirmRemove && (
                <ConfirmRemoveHostModal
                    open={!!confirmRemove}
                    submitting={removeSubmitting}
                    target={{
                        userId: confirmRemove.userId,
                        user: confirmRemove.user,
                        hasAttendance: attendanceByUserId.has(confirmRemove.userId),
                        hasManageEventsRole: !!confirmRemove.hasManageEventsRole,
                    }}
                    isSelf={!!currentUserId && confirmRemove.userId === currentUserId}
                    communityName={communityName}
                    onClose={() => { if (!removeSubmitting) setConfirmRemove(null); }}
                    onConfirm={() => void performRemove(confirmRemove)}
                />
            )}
        </section>
    );
}
