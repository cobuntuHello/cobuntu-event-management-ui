"use client";

import { useEffect, useMemo, useState } from "react";
import { useEventManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import { AttendeesActionModalShell } from "../attendees-action/AttendeesActionModalShell";

/**
 * Add a community member as a host of an event.
 *
 * Mirror-flow of PromoteAttendeeModal, but the candidate pool is
 * "community members who aren't already hosts" rather than "paid
 * attendees who aren't already hosts." Different data source, same
 * shell + same visual language.
 *
 * Talks to:
 *   GET  /api/communities/:tag/members/search?q=...&excludeUserIds=...
 *        Debounced 250ms. Server already filters non-members and
 *        existing hosts via excludeUserIds.
 *   POST /api/events/:eventId/hosts  { userId }
 *        The BE writes an event_host_audits row on success.
 *
 * Sits on AttendeesActionModalShell so admin's Add/Invite/Promote
 * surfaces all share one visual language.
 */

interface Member {
    id: string;
    name: string | null;
    usertag: string | null;
    profileImage: string | null;
}

export interface AddMemberAsHostModalProps {
    eventId: string;
    communityTag: string;
    /**
     * userIds the caller wants to exclude from the autocomplete (typically
     * the IDs of users who are already hosts of this event). The BE
     * filters server-side so excluded users never appear in the response.
     */
    excludeUserIds: string[];
    open: boolean;
    onClose: () => void;
    onAdded: (member: Member) => void;
}

export function AddMemberAsHostModal({
    eventId,
    communityTag,
    excludeUserIds,
    open,
    onClose,
    onAdded,
}: AddMemberAsHostModalProps) {
    const config = useEventManagementConfig();
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Member[]>([]);
    const [loading, setLoading] = useState(false);
    const [picked, setPicked] = useState<Member | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setQuery("");
            setResults([]);
            setPicked(null);
            setError(null);
        }
    }, [open]);

    // Debounced server-side search.
    useEffect(() => {
        if (!open || picked) return;
        const q = query.trim();
        if (q.length < 1) {
            setResults([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        const timer = setTimeout(async () => {
            try {
                const params = new URLSearchParams({ q });
                if (excludeUserIds.length > 0) {
                    params.set("excludeUserIds", excludeUserIds.join(","));
                }
                const res = await fetch(
                    `${config.apiBaseUrl}/api/communities/${communityTag}/members/search?${params.toString()}`,
                    { headers: config.authHeaders() },
                );
                if (cancelled) return;
                if (res.ok) {
                    const data = await res.json();
                    setResults(Array.isArray(data?.members) ? data.members : []);
                } else {
                    setResults([]);
                }
            } catch {
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [open, query, communityTag, excludeUserIds, picked, config]);

    async function confirm() {
        if (!picked) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`${config.apiBaseUrl}/api/events/${eventId}/hosts`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...config.authHeaders() },
                body: JSON.stringify({ userId: picked.id }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                if (res.status === 409) {
                    setError("This person is already a host.");
                } else if (res.status === 403) {
                    setError("You don't have permission to add hosts on this event.");
                } else {
                    setError(body?.error || body?.message || `Failed (${res.status})`);
                }
                return;
            }
            onAdded(picked);
            onClose();
        } catch (e: any) {
            setError(e?.message || "Network error");
        } finally {
            setSubmitting(false);
        }
    }

    const subtitle = picked
        ? "They'll appear in the hosts list and can manage the event."
        : "Search members of this community. Guests and non-members are filtered out.";

    return (
        <AttendeesActionModalShell
            isOpen={open}
            onClose={onClose}
            title="Add community member as host"
            subtitle={subtitle}
            unsavedCount={picked ? 1 : 0}
            footer={
                <div className="flex items-center justify-between gap-3">
                    {picked ? (
                        <>
                            <button
                                onClick={() => setPicked(null)}
                                disabled={submitting}
                                className="hidden sm:inline-flex px-4 py-2.5 text-[13px] text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer disabled:opacity-50"
                            >
                                Back
                            </button>
                            <button
                                onClick={confirm}
                                disabled={submitting}
                                className="flex-1 sm:flex-none px-5 py-2.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                                {submitting ? "Adding…" : "Add as host"}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onClose}
                            className="px-4 py-2.5 text-[13px] text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer ml-auto"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            }
        >
            <div className="px-5 sm:px-6 py-5">
                {picked ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 bg-zinc-50">
                            <UserAvatar user={picked} className="w-12 h-12" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[14px] font-semibold text-zinc-900 truncate">
                                    {picked.name || "Unknown"}
                                </p>
                                {picked.usertag && (
                                    <p className="text-[12px] text-zinc-500 truncate">@{picked.usertag}</p>
                                )}
                            </div>
                        </div>
                        <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-3 text-[12px] text-zinc-600 leading-relaxed">
                            <p className="font-medium text-zinc-800 mb-1">What happens next</p>
                            <ul className="space-y-1 list-disc list-inside [&>li]:pl-0">
                                <li>They appear in the hosts list and can manage the event.</li>
                                <li>They get an email letting them know they're now a host.</li>
                                <li>No payment changes hands. They're not an attendee.</li>
                            </ul>
                        </div>
                        {error && <p className="text-[12px] text-red-600">{error}</p>}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 shrink-0">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by name or @usertag"
                                autoFocus
                                className="flex-1 min-w-0 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none bg-transparent"
                            />
                        </div>

                        <div className="rounded-xl border border-zinc-100 divide-y divide-zinc-100 max-h-[380px] overflow-y-auto">
                            {loading ? (
                                <p className="px-4 py-8 text-center text-[12px] text-zinc-400">Searching…</p>
                            ) : query.trim().length === 0 ? (
                                <p className="px-4 py-8 text-center text-[12px] text-zinc-400">
                                    Start typing to search this community's members.
                                </p>
                            ) : results.length === 0 ? (
                                <p className="px-4 py-8 text-center text-[12px] text-zinc-400">
                                    No matches.
                                </p>
                            ) : (
                                results.map((m) => (
                                    <button
                                        key={m.id}
                                        onClick={() => setPicked(m)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 text-left cursor-pointer"
                                    >
                                        <UserAvatar user={m} className="w-8 h-8 shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13px] font-medium text-zinc-900 truncate">
                                                {m.name || "Unknown"}
                                            </p>
                                            {m.usertag && (
                                                <p className="text-[11px] text-zinc-400 truncate">@{m.usertag}</p>
                                            )}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        {error && <p className="text-[12px] text-red-600">{error}</p>}
                    </div>
                )}
            </div>
        </AttendeesActionModalShell>
    );
}
