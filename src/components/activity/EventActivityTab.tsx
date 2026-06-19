"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEventManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import {
    renderActivitySentence,
    formatRelativeTime,
    type ActivityEntryForRender,
} from "./activitySentences";

/**
 * Activity tab on the event manage page. Renders a reverse-chrono
 * feed of every host-visible action on the event by paging through
 * GET /api/communities/:tag/events/:eventId/activity (shipped in PR 5
 * of the event-activity-log umbrella).
 *
 * - One row per entry: actor avatar + sentence + relative time.
 * - Auto-loads the first page on mount. Infinite scroll: a sentinel at
 *   the end of the list triggers the next page via IntersectionObserver.
 * - Errors surface a single retry block + stop the polling. The feed
 *   degrades gracefully — a malformed cursor on the BE returns the
 *   first page rather than 4xx-ing, so we don't ever lock the host
 *   out of their own log.
 * - Sentences come from the activitySentences module. The consumer
 *   provides the `UserAvatar` slot via the EventManagementConfig
 *   provider; we fall back to UserAvatarFallback if the consumer
 *   hasn't wired one in.
 *
 * Auth + access: the BE endpoint is gated by HostService.canManageEvent
 * (host OR EVENTS_MANAGE_LISTINGS OR superadmin). 403/401 here means
 * the manage-page redirect (PR 1) should have already fired — we
 * surface a clear error message rather than redirect again.
 */

export interface EventActivityTabProps {
    /** The event whose activity to show. Pass the resolved event id
     *  (slug works too; the BE controller resolves either). */
    event: { id: string; slug?: string | null };
    /** Community tag of the event manage page hosting this tab. */
    communityTag: string;
    /** Optional cap on the initial fetch. Defaults to 25 — comfortable
     *  on a phone viewport; infinite scroll fills in from there. */
    pageSize?: number;
}

interface ActivityEntry {
    id: string;
    source: "EVENT_AUDIT" | "HOST_AUDIT";
    action: string;
    createdAt: string;
    actor: { id: string; name: string | null; usertag: string | null; profileImage: string | null } | null;
    payload: Record<string, unknown> | null;
}

interface ListResponse {
    entries: ActivityEntry[];
    nextCursor: string | null;
}

export function EventActivityTab({ event, communityTag, pageSize = 25 }: EventActivityTabProps) {
    const config = useEventManagementConfig();
    const API = config.apiBaseUrl;
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;

    const [entries, setEntries] = useState<ActivityEntry[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [exhausted, setExhausted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    // Bumps the relative-time labels every 30s so "2m ago" stays
    // fresh without a per-row interval.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(t);
    }, []);

    const eventIdOrSlug = event.id || event.slug || "";

    const loadPage = useCallback(
        async (pageCursor: string | null) => {
            if (loading) return;
            setLoading(true);
            setError(null);
            try {
                const url = new URL(
                    `${API}/api/communities/${communityTag}/events/${eventIdOrSlug}/activity`,
                );
                url.searchParams.set("limit", String(pageSize));
                if (pageCursor) url.searchParams.set("cursor", pageCursor);
                const res = await fetch(url.toString(), { headers: config.authHeaders() });
                if (!res.ok) {
                    // 403 from this endpoint means the manage-page gate
                    // didn't fire (PR 1's redirect). Surface a clear
                    // message rather than redirect from inside a tab
                    // — that's the page's responsibility.
                    if (res.status === 401) throw new Error("Sign in to view this event's activity.");
                    if (res.status === 403) throw new Error("Not authorized to view this event's activity.");
                    if (res.status === 404) throw new Error("Event not found.");
                    throw new Error(`Failed to load activity (${res.status})`);
                }
                const data = (await res.json()) as ListResponse;
                setEntries((prev) => (pageCursor ? [...prev, ...data.entries] : data.entries));
                setCursor(data.nextCursor);
                if (!data.nextCursor) setExhausted(true);
            } catch (err: any) {
                setError(err?.message ?? "Failed to load activity");
            } finally {
                setLoading(false);
            }
        },
        [API, communityTag, eventIdOrSlug, pageSize, config, loading],
    );

    // First page on mount.
    useEffect(() => {
        // Reset state when the event changes (rare — usually static,
        // but a host might switch events within the same tab).
        setEntries([]);
        setCursor(null);
        setExhausted(false);
        setError(null);
        void loadPage(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventIdOrSlug, communityTag]);

    // Infinite scroll: when the sentinel comes into view, fetch the
    // next page. We re-create the observer when cursor changes so it
    // captures the latest cursor in its closure.
    useEffect(() => {
        if (exhausted || loading || error || !cursor) return;
        const node = sentinelRef.current;
        if (!node) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    void loadPage(cursor);
                }
            },
            { rootMargin: "200px" },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [cursor, exhausted, loading, error, loadPage]);

    return (
        <section>
            <div className="mb-4">
                <h2 className="text-[15px] font-semibold text-zinc-900">Activity</h2>
                <p className="text-[12px] text-zinc-400 mt-0.5">
                    Every meaningful change to this event. Newest first.
                </p>
            </div>

            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
                {entries.length === 0 && !loading && !error ? (
                    <EmptyState />
                ) : (
                    <ul className="divide-y divide-zinc-100">
                        {entries.map((entry) => (
                            <ActivityRow
                                key={entry.id}
                                entry={entry}
                                now={now}
                                UserAvatar={UserAvatar}
                            />
                        ))}
                    </ul>
                )}

                {/* Loading state — same rounded card so the layout doesn't jump. */}
                {loading && <LoadingRow />}

                {error && (
                    <div className="px-6 py-6 text-center">
                        <p className="text-[13px] text-red-600 mb-2">{error}</p>
                        <button
                            type="button"
                            onClick={() => void loadPage(cursor)}
                            className="px-3 py-1.5 text-[12px] font-medium text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Sentinel for infinite scroll. Renders only while
                    there's more to fetch + no error blocks it. */}
                {cursor && !exhausted && !error && (
                    <div ref={sentinelRef} className="h-6" aria-hidden />
                )}

                {exhausted && entries.length > 0 && (
                    <p className="px-6 py-4 text-center text-[11px] text-zinc-400">
                        End of activity.
                    </p>
                )}
            </div>
        </section>
    );
}

function ActivityRow({
    entry,
    now,
    UserAvatar,
}: {
    entry: ActivityEntry;
    now: Date;
    UserAvatar: React.ComponentType<{
        user: {
            name?: string | null;
            imageUrl?: string | null;
            profileImage?: string | null;
            usertag?: string | null;
            email?: string | null;
            id?: string | null;
        };
        className?: string;
    }>;
}) {
    const sentence = renderActivitySentence(entry as ActivityEntryForRender);
    const relative = formatRelativeTime(entry.createdAt, now);
    const fullDateTooltip = (() => {
        const d = new Date(entry.createdAt);
        if (Number.isNaN(d.getTime())) return entry.createdAt;
        return d.toLocaleString();
    })();
    return (
        <li className="flex items-start gap-3 px-4 sm:px-6 py-3">
            <UserAvatar
                user={{
                    id: entry.actor?.id ?? null,
                    name: entry.actor?.name ?? null,
                    usertag: entry.actor?.usertag ?? null,
                    profileImage: entry.actor?.profileImage ?? null,
                }}
                className="w-8 h-8 shrink-0"
            />
            <div className="flex-1 min-w-0">
                <p className="text-[13px] text-zinc-800 leading-snug">{sentence.text}</p>
                <p
                    className="text-[11px] text-zinc-400 mt-0.5"
                    title={fullDateTooltip}
                >
                    {relative}
                </p>
            </div>
        </li>
    );
}

function LoadingRow() {
    return (
        <div className="px-6 py-4 flex items-center gap-3" aria-busy="true">
            <div className="w-8 h-8 rounded-full bg-zinc-100 animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 rounded bg-zinc-100 animate-pulse" />
                <div className="h-2.5 w-1/3 rounded bg-zinc-100/70 animate-pulse" />
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="px-6 py-12 text-center">
            <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="mx-auto text-zinc-200 mb-3"
                aria-hidden
            >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </svg>
            <p className="text-sm text-zinc-500">No activity yet</p>
            <p className="text-xs text-zinc-400 mt-1">
                Edits, attendee actions, and settings changes will show up here.
            </p>
        </div>
    );
}
