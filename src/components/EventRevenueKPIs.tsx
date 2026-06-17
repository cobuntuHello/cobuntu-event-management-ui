"use client";

import { useEffect, useState } from "react";
import { useEventManagementConfig } from "../config";

/**
 * Paid-event revenue KPI tiles — Paid attendees / Revenue / Fees / Net.
 *
 * Extracted from AttendeesAndInvitationsSection (was rendered at the top
 * of that section) so it can be mounted independently on the Overview tab
 * while the rest of the section moves to a dedicated Attendees tab. See
 * the manage-event-restructure plan in cobuntu-backend-monorepo.
 *
 * Renders nothing for free events or paid events with zero sales (mirrors
 * the previous in-section behaviour — the tiles only had value when there
 * was money on the table).
 */

interface Props {
    event: any;
    communityTag: string;
    /** Bump to force a refetch (e.g. after a refund issued elsewhere). */
    refreshKey?: number;
}

interface SaleSummary {
    eventId: string | null;
    grossAmount: number;
    ownerNetPayout: number;
    platformFee: number;
    stripeFees?: number | null;
    stripeTaxFee?: number | null;
    refundStatus: string;
}

export function EventRevenueKPIs({ event, communityTag, refreshKey = 0 }: Props) {
    const config = useEventManagementConfig();
    const API = config.apiBaseUrl;
    const authHeaders = config.authHeaders;

    const isPaid = event?.price > 0;
    const currency = event?.currency || "EUR";

    const [sales, setSales] = useState<SaleSummary[]>([]);

    useEffect(() => {
        if (!isPaid || !event?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${API}/api/communities/${communityTag}/sales?timeRange=1y`, {
                    headers: authHeaders(),
                });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                const rows: SaleSummary[] = (data.sales || [])
                    .filter((s: any) => s.eventId === event.id && s.refundStatus === "NONE")
                    // Dedup by id — the events-section keys each sale under both
                    // uid:* and em:*, but here we aggregate so we just need the id.
                    .reduce((acc: SaleSummary[], s: any) => {
                        if (acc.find((r) => (r as any).id === s.id)) return acc;
                        acc.push({
                            ...s,
                            id: s.id,
                        });
                        return acc;
                    }, []);
                if (!cancelled) setSales(rows);
            } catch {
                // KPIs are best-effort; on fetch failure we render nothing rather
                // than blocking the page or showing a half-state.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [event?.id, communityTag, isPaid, refreshKey]);

    if (!isPaid) return null;
    const paidCount = sales.length;
    if (paidCount === 0) return null;

    const totalRevenue = sales.reduce((sum, s) => sum + s.grossAmount, 0);
    const totalFees = sales.reduce((sum, s) => sum + s.platformFee + (s.stripeFees ?? 0) + (s.stripeTaxFee ?? 0), 0);
    const totalNet = sales.reduce((sum, s) => sum + s.ownerNetPayout, 0);

    const fmtMoney = (cents: number) => {
        try {
            return new Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: currency.toUpperCase(),
            }).format(cents / 100);
        } catch {
            return `${(cents / 100).toFixed(2)} ${currency}`;
        }
    };

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-3 sm:p-5">
                <p className="text-xs text-zinc-500">Paid attendees</p>
                <p className="text-xl sm:text-2xl font-semibold text-zinc-900 mt-1 tabular-nums">{paidCount}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 sm:p-5">
                <p className="text-xs text-zinc-500">Revenue</p>
                <p className="text-xl sm:text-2xl font-semibold text-zinc-900 mt-1 tabular-nums">{fmtMoney(totalRevenue)}</p>
                <p className="text-xs text-zinc-400 mt-1">{paidCount} transactions, gross</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 sm:p-5">
                <p className="text-xs text-zinc-500">Fees paid</p>
                <p className="text-xl sm:text-2xl font-semibold text-zinc-900 mt-1 tabular-nums">{fmtMoney(totalFees)}</p>
                <p className="text-xs text-zinc-400 mt-1">Platform + Stripe</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 sm:p-5">
                <p className="text-xs text-zinc-500">Net earnings</p>
                <p className="text-xl sm:text-2xl font-semibold text-emerald-600 mt-1 tabular-nums">{fmtMoney(totalNet)}</p>
                <p className="text-xs text-zinc-400 mt-1">After all fees</p>
            </div>
        </div>
    );
}
