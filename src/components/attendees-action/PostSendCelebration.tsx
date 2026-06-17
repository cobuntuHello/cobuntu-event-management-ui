"use client";

import { useEffect, useState } from "react";

/**
 * Stats + delivery status state shown after a successful Invite or Add.
 *
 * Two intents:
 *
 *   - **invite**: shows per-recipient delivery status (queued / delivered
 *     / bounced). Subscribes to a short-lived polling loop for 60s after
 *     mount. Each poll fetches the invitation list and updates statuses
 *     by `email`. After the 60s window the snapshot freezes.
 *
 *   - **add**: simpler summary (X attendees added, X confirmation
 *     emails dispatched). No delivery streaming — confirmation emails
 *     are fire-and-forget, surface live status would be misleading.
 *
 * Lives INSIDE the AttendeesActionModalShell — replaces the body when
 * `sendResult` is non-null. Footer slot swaps to a `Done / Send more`
 * pair (the parent owns that).
 */

interface InviteDelivery {
    email: string;
    name: string;
    status: "queued" | "delivered" | "opened" | "bounced" | "failed";
}

interface Props {
    mode: "add" | "invite";
    /** Number of recipients that landed successfully. */
    successCount: number;
    /** Per-recipient list for the delivery breakdown (Invite mode only). */
    initialDeliveries?: InviteDelivery[];
    /** When set, the parent's onSendMore handler is shown as a button. */
    communityTag: string;
    eventId: string;
    authHeaders: () => Record<string, string>;
    apiBaseUrl: string;
}

export function PostSendCelebration({
    mode,
    successCount,
    initialDeliveries = [],
    communityTag,
    eventId,
    authHeaders,
    apiBaseUrl,
}: Props) {
    const [deliveries, setDeliveries] = useState(initialDeliveries);
    const [polling, setPolling] = useState(mode === "invite" && initialDeliveries.length > 0);

    useEffect(() => {
        if (mode !== "invite") return;
        if (!polling) return;
        // Poll the invitations endpoint every 8s for 60s. Real-time-ish
        // without a websocket dependency. The BE updates invitation
        // statuses from Resend webhooks; this just observes the rows.
        const intervalMs = 8000;
        const totalMs = 60_000;
        const stopAt = Date.now() + totalMs;
        let cancelled = false;
        async function tick() {
            try {
                const res = await fetch(
                    `${apiBaseUrl}/api/communities/${communityTag}/events/${eventId}/invitations?limit=50`,
                    { headers: authHeaders() },
                );
                if (!res.ok || cancelled) return;
                const data = await res.json();
                const rows: Array<{ email: string; name?: string; status: string }> = data?.invitations || [];
                // Match by email. Update statuses on the deliveries list
                // we already have; ignore rows we didn't issue this round.
                setDeliveries((prev) => prev.map((d) => {
                    const updated = rows.find((r) => r.email?.toLowerCase() === d.email.toLowerCase());
                    if (!updated) return d;
                    return { ...d, status: mapStatus(updated.status) };
                }));
            } catch { /* swallow — retry on next tick */ }
        }
        tick();
        const id = setInterval(() => {
            if (Date.now() > stopAt) {
                clearInterval(id);
                setPolling(false);
                return;
            }
            tick();
        }, intervalMs);
        return () => { cancelled = true; clearInterval(id); };
    }, [polling, mode, apiBaseUrl, communityTag, eventId, authHeaders]);

    const counts = deliveries.reduce(
        (acc, d) => {
            acc[d.status] = (acc[d.status] || 0) + 1;
            return acc;
        },
        {} as Record<string, number>,
    );

    if (mode === "add") {
        return (
            <div className="px-5 sm:px-6 py-8 sm:py-12 flex flex-col items-center text-center">
                <CheckBig />
                <h3 className="text-lg font-semibold text-zinc-900 mt-4">
                    {successCount} attendee{successCount === 1 ? "" : "s"} added
                </h3>
                <p className="text-sm text-zinc-500 mt-1 max-w-sm">
                    Confirmation emails have been dispatched to anyone with an email address on file.
                </p>
            </div>
        );
    }

    return (
        <div className="px-5 sm:px-6 py-6 sm:py-8">
            <div className="flex flex-col items-center text-center mb-6">
                <CheckBig />
                <h3 className="text-lg font-semibold text-zinc-900 mt-4">
                    {successCount} invitation{successCount === 1 ? "" : "s"} sent
                </h3>
                <p className="text-sm text-zinc-500 mt-1">
                    {polling ? "Watching delivery — updates for 60 seconds." : "Snapshot frozen."}
                </p>
            </div>

            {deliveries.length > 0 && (
                <>
                    {/* Aggregate bars */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                        <Stat label="Delivered" count={(counts.delivered || 0) + (counts.opened || 0)} total={deliveries.length} accent="emerald" />
                        <Stat label="Queued" count={counts.queued || 0} total={deliveries.length} accent="zinc" />
                        <Stat label="Bounced" count={counts.bounced || 0} total={deliveries.length} accent="red" />
                        <Stat label="Failed" count={counts.failed || 0} total={deliveries.length} accent="red" />
                    </div>

                    {/* Per-recipient rows */}
                    <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100 max-h-[280px] overflow-y-auto">
                        {deliveries.map((d) => (
                            <div key={d.email} className="flex items-center gap-3 px-4 py-2.5">
                                <DeliveryIcon status={d.status} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-zinc-900 truncate">{d.name || d.email}</p>
                                    {d.name && d.email !== d.name && (
                                        <p className="text-[11px] text-zinc-400 truncate">{d.email}</p>
                                    )}
                                </div>
                                <span className={[
                                    "text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0",
                                    statusBadge(d.status),
                                ].join(" ")}>{d.status}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function CheckBig() {
    return (
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-600">
                <polyline points="20 6 9 17 4 12" />
            </svg>
        </div>
    );
}

function Stat({ label, count, total, accent }: { label: string; count: number; total: number; accent: "emerald" | "zinc" | "red" }) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const colorBar = accent === "emerald" ? "bg-emerald-500" : accent === "red" ? "bg-red-400" : "bg-zinc-400";
    const colorText = accent === "emerald" ? "text-emerald-700" : accent === "red" ? "text-red-600" : "text-zinc-600";
    return (
        <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">{label}</p>
            <p className={`text-base font-semibold tabular-nums mt-0.5 ${colorText}`}>{count}<span className="text-[11px] text-zinc-400 ml-1">/{total}</span></p>
            <div className="h-1 rounded-full bg-zinc-100 overflow-hidden mt-1.5">
                <div className={`h-full ${colorBar} transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function DeliveryIcon({ status }: { status: InviteDelivery["status"] }) {
    if (status === "delivered" || status === "opened") {
        return (
            <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-600">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </span>
        );
    }
    if (status === "bounced" || status === "failed") {
        return (
            <span className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-600">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </span>
        );
    }
    return (
        <span className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500 animate-pulse">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
            </svg>
        </span>
    );
}

function statusBadge(status: InviteDelivery["status"]): string {
    switch (status) {
        case "delivered":
        case "opened":
            return "bg-emerald-100 text-emerald-700";
        case "bounced":
        case "failed":
            return "bg-red-100 text-red-700";
        default:
            return "bg-zinc-100 text-zinc-600";
    }
}

function mapStatus(s: string): InviteDelivery["status"] {
    switch (s?.toUpperCase()) {
        case "DELIVERED": return "delivered";
        case "OPENED": return "opened";
        case "BOUNCED": return "bounced";
        case "FAILED": return "failed";
        default: return "queued";
    }
}
