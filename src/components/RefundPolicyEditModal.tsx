"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useUpdateEvent } from "../config";

/**
 * Edit `events.refundPolicy` — the per-event refund policy.
 *
 * Two orthogonal levers:
 *
 *   1. Host extension (mode = 'default' | 'extended'):
 *      - 'default'  → hosts can refund only ESCROW sales (today's
 *                     behaviour, the safe default).
 *      - 'extended' → hosts can also refund ELIGIBLE + HOLD sales —
 *                     money the daily payout sweep has not yet shipped
 *                     to the community's Stripe Connect account
 *                     (ELIGIBLE = awaiting the next sweep, HOLD =
 *                     parked below the payout threshold).
 *      PAID sales are ALWAYS blocked through Cobuntu under both
 *      modes — the host refunds those directly from their community's
 *      Stripe Express dashboard. We show that as informational text
 *      on the extended option.
 *
 *   2. Buyer self-service (customBuyerWindowDays):
 *      Payout reform made this on/off only — any value > 0 means
 *      "buyers can self-refund until the event ends", 0 disables
 *      self-service (buyers must contact the host). The magnitude is
 *      no longer meaningful, so the UI is a toggle.
 *
 * Server-stamped fields (updatedAt, updatedByUserId) are NEVER
 * supplied by the FE — the backend overwrites them on every save.
 * See docs/features/configurable-event-refund-policy.md.
 */

interface RefundPolicy {
    mode: "default" | "extended";
    customBuyerWindowDays?: number;
    updatedAt?: string;
    updatedByUserId?: string | null;
}

interface Props {
    event: any;
    communityTag: string;
    onClose: () => void;
    onSaved: () => void;
    showToast: (msg: string) => void;
}

// Any positive value = "buyers can self-refund until the event ends"; the
// magnitude is no longer meaningful (payout reform), so we send a stable
// default when enabling and 0 when disabling.
const DEFAULT_BUYER_WINDOW_DAYS = 7;

export function RefundPolicyEditModal({ event, communityTag, onClose, onSaved, showToast }: Props) {
    const updateEvent = useUpdateEvent();
    const currentPolicy: RefundPolicy = readPolicy(event.refundPolicy);
    const [mode, setMode] = useState<"default" | "extended">(currentPolicy.mode);
    // on/off only: > 0 means enabled-until-END.
    const [buyerSelfRefund, setBuyerSelfRefund] = useState<boolean>(
        (currentPolicy.customBuyerWindowDays ?? DEFAULT_BUYER_WINDOW_DAYS) > 0,
    );
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            await updateEvent(communityTag, event.id, {
                refundPolicy: {
                    mode,
                    // > 0 = enabled-until-END; preserve any existing positive
                    // value, else fall back to the default. 0 = disabled.
                    customBuyerWindowDays: buyerSelfRefund
                        ? (currentPolicy.customBuyerWindowDays || DEFAULT_BUYER_WINDOW_DAYS)
                        : 0,
                },
            } as any);
            showToast("Refund policy updated");
            onSaved();
        } catch (e: any) {
            showToast(e?.message || "Failed to update refund policy");
        } finally {
            setSaving(false);
        }
    }

    return (
        <ModalShell onClose={onClose}>
            <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Refund policy</h3>
            <p className="text-[12px] text-zinc-500 mb-4">
                Controls when buyers can self-refund and how far you can refund tickets on their behalf.
            </p>

            {/* Host extension toggle */}
            <div className="mb-5">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Host refunds</p>
                <div className="space-y-2">
                    <RadioRow
                        selected={mode === "default"}
                        onClick={() => setMode("default")}
                        title="Standard"
                        subtitle="You can refund tickets while funds are still held in escrow, before the refund window closes."
                    />
                    <RadioRow
                        selected={mode === "extended"}
                        onClick={() => setMode("extended")}
                        title="Extended"
                        subtitle="You can refund tickets after the refund window closes too, right up until the payout reaches your community's Stripe account."
                    />
                </div>
                <div className="mt-3 rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2">
                    <p className="text-[11px] text-zinc-500 leading-snug">
                        Once a payout has been sent to your community's Stripe account, refund the buyer directly from your{" "}
                        <span className="font-medium text-zinc-700">Stripe dashboard</span>. Cobuntu does not refund funds that have
                        already been paid out.
                    </p>
                </div>
            </div>

            {/* Buyer self-service (on/off — reform: enabled means until the event ends) */}
            <div className="mb-5">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Buyer self-service</p>
                <div className="space-y-2">
                    <RadioRow
                        selected={buyerSelfRefund}
                        onClick={() => setBuyerSelfRefund(true)}
                        title="Allowed until the event ends"
                        subtitle="Buyers can cancel and self-refund any time up to when the event ends."
                    />
                    <RadioRow
                        selected={!buyerSelfRefund}
                        onClick={() => setBuyerSelfRefund(false)}
                        title="Off"
                        subtitle="Buyers can't self-refund. They'll see a 'Contact the host' message instead."
                    />
                </div>
            </div>

            <div className="flex justify-end gap-2">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                >
                    {saving ? "Saving..." : "Save"}
                </button>
            </div>
        </ModalShell>
    );
}

/**
 * Coerces the events.refundPolicy JSON column (which may be null,
 * undefined, or a partial shape on old rows) into a known typed
 * defaults-applied object the UI can consume directly. Mirrors the
 * BE coerceRefundPolicy helper, except it preserves
 * customBuyerWindowDays = 0 (a meaningful "buyer self-service off"
 * setting) instead of falling back to undefined.
 */
function readPolicy(raw: unknown): RefundPolicy {
    if (!raw || typeof raw !== "object") return { mode: "default" };
    const r = raw as Record<string, unknown>;
    const mode: RefundPolicy["mode"] = r.mode === "extended" ? "extended" : "default";
    // on/off only now — any non-negative value is preserved (> 0 = enabled
    // until the event ends, 0 = disabled). No upper bound; the magnitude is
    // no longer meaningful.
    const days = typeof r.customBuyerWindowDays === "number" ? r.customBuyerWindowDays : undefined;
    const out: RefundPolicy = { mode };
    if (days !== undefined && Number.isFinite(days) && days >= 0) {
        out.customBuyerWindowDays = days;
    }
    return out;
}

export function refundPolicySummary(raw: unknown): string {
    const policy = readPolicy(raw);
    const days = policy.customBuyerWindowDays ?? DEFAULT_BUYER_WINDOW_DAYS;
    const buyerPart = days > 0
        ? "Buyers self-refund until the event ends"
        : "Buyer self-service off";
    if (policy.mode === "extended") {
        return `Extended · ${buyerPart}`;
    }
    return `Standard · ${buyerPart}`;
}

function RadioRow({
    selected,
    onClick,
    title,
    subtitle,
}: {
    selected: boolean;
    onClick: () => void;
    title: string;
    subtitle: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full text-left flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                selected ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50/50"
            }`}
        >
            <span
                className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? "border-zinc-900" : "border-zinc-300"
                }`}
            >
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-zinc-900" />}
            </span>
            <span className="min-w-0">
                <span className="block text-[13px] font-medium text-zinc-900">{title}</span>
                <span className="block text-[12px] text-zinc-500 mt-0.5">{subtitle}</span>
            </span>
        </button>
    );
}
