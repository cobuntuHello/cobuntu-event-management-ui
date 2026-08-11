"use client";

import { useEffect, useState } from "react";
import { getEventManagementConfig } from "../config";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface SummaryResponse {
    total: number;        // smallest currency unit
    count: number;
    currency: string | null;
}

interface BaseProps {
    communityTag: string;
}

type Props = BaseProps & (
    | { eventId: string; productId?: undefined }
    | { eventId?: undefined; productId: string }
);

/**
 * Donations summary KPI card for the event + product admin detail pages.
 * Phase 4.2b of docs/features/donations.md (in cobuntu-backend-monorepo).
 *
 * Backed by the admin-cookie summary endpoints shipped in Phase 4.2a:
 *   GET /api/communities/:tag/events/:eventId/donations/summary
 *   GET /api/communities/:tag/products/:productId/donations/summary
 *
 * Renders three visual states:
 *   - Loading shimmer (briefly, while fetching)
 *   - Empty: "No donations yet — donors will show up here when buyers tip"
 *   - Populated: "€420 raised across 18 donations"
 *
 * The card auto-hides when the request 4xx's (most commonly: caller
 * lacks FINANCIAL_PAYOUTS or the entity isn't in this community) —
 * caller-side error noise would be louder than the value the card adds.
 */
export function DonationsSummaryCard(props: Props) {
    const { communityTag } = props;
    const [data, setData] = useState<SummaryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        const url = "eventId" in props && props.eventId
            ? `${API}/api/communities/${communityTag}/events/${props.eventId}/donations/summary`
            : `${API}/api/communities/${communityTag}/products/${(props as { productId: string }).productId}/donations/summary`;

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${getEventManagementConfig().authHeaders().Authorization}` },
                });
                if (cancelled) return;
                if (!res.ok) {
                    // Hide quietly — the host might not have the right
                    // permission for this community; that's not an error
                    // worth screaming about. (Same pattern as the rest of
                    // the admin detail page: optional sections fade away
                    // rather than nag.)
                    setHidden(true);
                    return;
                }
                const json = (await res.json()) as SummaryResponse;
                setData(json);
            } catch {
                if (!cancelled) setHidden(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [communityTag, "eventId" in props ? props.eventId : props.productId]);

    if (hidden) return null;

    return (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Donations</p>
                    {loading ? (
                        <div className="mt-2 space-y-2">
                            <div className="h-7 w-32 rounded bg-zinc-100 animate-pulse" />
                            <div className="h-3 w-24 rounded bg-zinc-100 animate-pulse" />
                        </div>
                    ) : data && data.count > 0 ? (
                        <>
                            <p className="mt-1 text-2xl font-semibold text-zinc-900 tabular-nums">
                                {formatAmount(data.total, data.currency)}
                            </p>
                            <p className="mt-1 text-[13px] text-zinc-500">
                                across {data.count} donation{data.count === 1 ? "" : "s"}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="mt-1 text-2xl font-semibold text-zinc-300 tabular-nums">—</p>
                            <p className="mt-1 text-[13px] text-zinc-500">No donations yet</p>
                        </>
                    )}
                </div>
                <div className="shrink-0 w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                    {/* Lucide heart-handshake icon (open-source). Avoids
                        adding a runtime dep when most cards in this app
                        inline their icons too. */}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m12 15-3-3a3 3 0 0 1 4-4l1 1 1-1a3 3 0 0 1 4 4l-3 3-2 2-2-2Z" />
                        <path d="m18 20 1 1" />
                        <path d="m6 20-1 1" />
                        <path d="M12 12v.01" />
                    </svg>
                </div>
            </div>
        </div>
    );
}

/**
 * Smallest-unit integer → display string. Mirrors the buyer-side
 * formatting; safe for unknown currencies (falls back to a generic
 * "1234 currency" view).
 */
function formatAmount(smallestUnit: number, currency: string | null): string {
    if (!currency) return String(smallestUnit);
    const isZeroDecimal = currency.toUpperCase() === "JPY";
    const major = isZeroDecimal ? smallestUnit : smallestUnit / 100;
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: currency.toUpperCase(),
            minimumFractionDigits: isZeroDecimal ? 0 : 2,
            maximumFractionDigits: isZeroDecimal ? 0 : 2,
        }).format(major);
    } catch {
        return `${major} ${currency.toUpperCase()}`;
    }
}
