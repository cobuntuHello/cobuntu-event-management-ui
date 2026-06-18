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
 *      - 'extended' → hosts can refund ESCROW + ELIGIBLE sales (money
 *                     still in platform float, before the bi-weekly
 *                     cron has shipped to the community's Stripe
 *                     Connect account).
 *      PAID sales are ALWAYS blocked through Cobuntu under both
 *      modes — the host refunds those directly from their community's
 *      Stripe Express dashboard. We show that as informational text
 *      on the extended option.
 *
 *   2. Buyer self-service window (customBuyerWindowDays):
 *      Days before the event that buyers can still self-refund.
 *      Default 7. Range 0–90. 0 disables self-service entirely
 *      (buyers must always contact the host).
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

const DEFAULT_BUYER_WINDOW_DAYS = 7;
const MAX_BUYER_WINDOW_DAYS = 90;

export function RefundPolicyEditModal({ event, communityTag, onClose, onSaved, showToast }: Props) {
    const updateEvent = useUpdateEvent();
    const currentPolicy: RefundPolicy = readPolicy(event.refundPolicy);
    const [mode, setMode] = useState<"default" | "extended">(currentPolicy.mode);
    const [buyerWindowDays, setBuyerWindowDays] = useState<number>(
        currentPolicy.customBuyerWindowDays ?? DEFAULT_BUYER_WINDOW_DAYS,
    );
    const [saving, setSaving] = useState(false);
    const [windowError, setWindowError] = useState<string | null>(null);

    function validateAndSetWindow(raw: string) {
        // Empty input means "stay at the current value visually" — only
        // commit on submit. Don't fight the user mid-keystroke.
        if (raw === "") {
            setWindowError(null);
            setBuyerWindowDays(NaN as any);
            return;
        }
        const n = Number(raw);
        if (!Number.isInteger(n)) {
            setWindowError("Whole days only.");
            setBuyerWindowDays(n);
            return;
        }
        if (n < 0 || n > MAX_BUYER_WINDOW_DAYS) {
            setWindowError(`Must be between 0 and ${MAX_BUYER_WINDOW_DAYS}.`);
            setBuyerWindowDays(n);
            return;
        }
        setWindowError(null);
        setBuyerWindowDays(n);
    }

    async function save() {
        if (windowError) return;
        // If the field was emptied, fall back to the default rather
        // than sending NaN.
        const effectiveDays = Number.isInteger(buyerWindowDays) ? buyerWindowDays : DEFAULT_BUYER_WINDOW_DAYS;
        setSaving(true);
        try {
            await updateEvent(communityTag, event.id, {
                refundPolicy: {
                    mode,
                    customBuyerWindowDays: effectiveDays,
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
                        subtitle="You can refund tickets while funds are in escrow (before the next payout cycle picks them up)."
                    />
                    <RadioRow
                        selected={mode === "extended"}
                        onClick={() => setMode("extended")}
                        title="Extended"
                        subtitle="You can refund tickets until the bi-weekly payout sends funds to your community's Stripe account."
                    />
                </div>
                <div className="mt-3 rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2">
                    <p className="text-[11px] text-zinc-500 leading-snug">
                        Once a payout has been sent to your community's Stripe account, refund the buyer directly from your{" "}
                        <span className="font-medium text-zinc-700">Stripe dashboard</span>. Cobuntu does not refund funds that have left
                        platform escrow.
                    </p>
                </div>
            </div>

            {/* Buyer self-service window */}
            <div className="mb-5">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Buyer self-service window</p>
                <label className="flex items-center gap-3">
                    <span className="text-[13px] text-zinc-700">Buyers can self-refund up to</span>
                    <input
                        type="number"
                        min={0}
                        max={MAX_BUYER_WINDOW_DAYS}
                        step={1}
                        value={Number.isInteger(buyerWindowDays) ? buyerWindowDays : ""}
                        onChange={(e) => validateAndSetWindow(e.target.value)}
                        className={`w-16 text-center rounded-lg border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-200 ${
                            windowError ? "border-red-300 bg-red-50" : "border-zinc-200"
                        }`}
                        aria-label="Days before event"
                    />
                    <span className="text-[13px] text-zinc-700">days before the event.</span>
                </label>
                {windowError && <p className="mt-1 text-[11px] text-red-600">{windowError}</p>}
                <p className="mt-2 text-[11px] text-zinc-500 leading-snug">
                    Past that cutoff, buyers see a "Contact the host" message instead of the self-refund button. Set to{" "}
                    <span className="font-medium text-zinc-700">0</span> to disable self-service entirely.
                </p>
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
                    disabled={saving || !!windowError}
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
    const days = typeof r.customBuyerWindowDays === "number" ? r.customBuyerWindowDays : undefined;
    const out: RefundPolicy = { mode };
    if (days !== undefined && Number.isFinite(days) && days >= 0 && days <= MAX_BUYER_WINDOW_DAYS) {
        out.customBuyerWindowDays = days;
    }
    return out;
}

export function refundPolicySummary(raw: unknown): string {
    const policy = readPolicy(raw);
    const days = policy.customBuyerWindowDays ?? DEFAULT_BUYER_WINDOW_DAYS;
    const buyerPart = days === 0
        ? "Buyer self-service off"
        : `Buyers self-refund up to ${days} day${days === 1 ? "" : "s"} pre-event`;
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
