"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEventManagementConfig } from "../../config";
import { HostChip, type Host } from "./HostChip";
import { AddMemberAsHostModal } from "./AddMemberAsHostModal";
import { PromoteAttendeeModal } from "../PromoteAttendeeModal";

/**
 * Single shared host-management surface used by admin + community-app.
 *
 * Renders the hosts list as a stack of HostChips, with two add-paths
 * exposed as buttons below:
 *   - "Add community member" → AddMemberAsHostModal (searches community
 *     members; the BE filters non-members and already-hosts via
 *     excludeUserIds)
 *   - "Promote attendee" → PromoteAttendeeModal (paid attendees who
 *     aren't already hosts; consumer pre-filters the list and passes
 *     it in)
 *
 * Per-host actions live in each HostChip — "Demote to attendee" vs
 * "Remove from hosts" is chosen by whether the target user has an
 * existing event_attendances row (smart label).
 *
 * Creator-immutability is enforced both in the UI (the immutable
 * creator-host renders a locked badge with no menu) AND on the BE
 * (DELETE returns 403 EVENT_CREATOR_IMMUTABLE for that case).
 *
 * Pure consumer responsibility: pass `event` + `canManage`. The
 * component self-fetches hosts and the eligible-attendees list it
 * needs for the Promote path.
 */

export interface HostsManagementSectionProps {
    event: {
        id: string;
        /** NULL = user-owned event (creator is immutable). NOT NULL = community-owned. */
        communityId: string | null;
        createdByUserId: string;
        endDate?: string | Date | null;
    };
    communityTag: string;
    /** Whether the current user can mutate (= is host OR has EVENTS_MANAGE_LISTINGS). */
    canManage: boolean;
    /**
     * Optional override for the list of paid attendees eligible to be
     * promoted to host. If omitted, the section fetches its own list
     * from `GET /api/events/:id/attendees?status=APPROVED`. Pass a
     * pre-filtered list when the consumer already has it cached.
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
    canManage,
    eligibleAttendees: eligibleAttendeesProp,
}: HostsManagementSectionProps) {
    const config = useEventManagementConfig();
    const [hosts, setHosts] = useState<Host[]>([]);
    const [attendees, setAttendees] = useState<Attendee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [promoteOpen, setPromoteOpen] = useState(false);

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

    // Index attendances by userId for the demote-vs-remove smart label.
    const attendanceByUserId = useMemo(() => {
        const m = new Map<string, Attendee>();
        for (const a of attendees) {
            if (a.userId) m.set(a.userId, a);
        }
        return m;
    }, [attendees]);

    // Build the eligible-attendees list for Promote (consumer override OR self-derive).
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

    const handleRemove = useCallback(
        async (host: Host) => {
            // Optimistic: drop the chip immediately, restore on error.
            const before = hosts;
            setHosts((curr) => curr.filter((h) => h.id !== host.id));
            try {
                const res = await fetch(
                    `${config.apiBaseUrl}/api/events/${event.id}/hosts/${host.userId}`,
                    {
                        method: "DELETE",
                        headers: config.authHeaders(),
                    },
                );
                if (!res.ok) {
                    setHosts(before);
                    const body = await res.json().catch(() => null);
                    if (res.status === 403 && body?.code === "EVENT_CREATOR_IMMUTABLE") {
                        // Defensive — the FE should already hide the menu on the
                        // immutable creator. Surface the BE rejection if it slipped through.
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
            }
        },
        [hosts, config, event.id, refresh],
    );

    const showActionButtons = canManage && !isPastEvent;

    return (
        <section className="rounded-2xl border border-zinc-200 bg-white">
            <header className="px-5 py-4 border-b border-zinc-100">
                <h2 className="text-[15px] font-semibold text-zinc-900">Hosts</h2>
                <p className="text-[12px] text-zinc-500 mt-0.5">
                    People who can manage this event. {isUserOwned ? "The creator is immutable." : null}
                </p>
            </header>

            <div className="p-2">
                {loading ? (
                    <p className="px-3 py-4 text-[12px] text-zinc-400">Loading hosts…</p>
                ) : hosts.length === 0 ? (
                    <p className="px-3 py-4 text-[12px] text-zinc-400">
                        No hosts yet.{" "}
                        {isUserOwned
                            ? "This event needs a creator-host."
                            : "Anyone with the EVENTS_MANAGE_LISTINGS role can still manage it."}
                    </p>
                ) : (
                    <ul className="space-y-0.5">
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
                                        onRemove={() => handleRemove(h)}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {showActionButtons && (
                <footer className="px-5 py-3 border-t border-zinc-100 flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setAddOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-zinc-900 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add community member
                    </button>
                    {eligibleAttendees.length > 0 && (
                        <button
                            onClick={() => setPromoteOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-zinc-900 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="18 15 12 9 6 15" />
                            </svg>
                            Promote attendee
                        </button>
                    )}
                </footer>
            )}

            {error && (
                <div className="px-5 py-2 text-[12px] text-red-600 border-t border-zinc-100">
                    {error}
                </div>
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
        </section>
    );
}
