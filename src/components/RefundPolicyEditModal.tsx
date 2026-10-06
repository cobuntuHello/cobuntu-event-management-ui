"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useUpdateEvent } from "../config";
import { RefundPolicyField, type RefundPolicyValue } from "./RefundPolicyField";

/**
 * Edit `events.refundPolicy` on the manage page, using the SAME RefundPolicyField
 * the create wizard's "Policies & access" step shows — one setting, one widget,
 * two places (T-234). Simplified to the two presets hosts actually asked for:
 *
 *   - Standard refunds        → platform default window (policy = null)
 *   - No self-service refunds → buyers contact the host (customBuyerWindowDays: 0)
 *
 * The backend still supports the richer mode/window matrix; this control only
 * writes these two shapes. Server-stamped fields (updatedAt, updatedByUserId) are
 * never supplied by the FE. See docs/features/configurable-event-refund-policy.md.
 */
interface Props {
    event: any;
    communityTag: string;
    onClose: () => void;
    onSaved: () => void;
    showToast: (msg: string) => void;
}

export function RefundPolicyEditModal({ event, communityTag, onClose, onSaved, showToast }: Props) {
    const updateEvent = useUpdateEvent();
    const [value, setValue] = useState<RefundPolicyValue>(event?.refundPolicy ?? null);
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            await updateEvent(communityTag, event.id, { refundPolicy: value } as any);
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
                Choose whether buyers can refund themselves. Once a payout has reached your community's
                Stripe account, refund the buyer directly from your Stripe dashboard.
            </p>

            <div className="mb-5">
                <RefundPolicyField value={value} onChange={setValue} />
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
 * One-line summary for the settings drawer row. Two presets now (standard vs
 * none), matching RefundPolicyField — only customBuyerWindowDays === 0 changes it.
 */
export function refundPolicySummary(raw: unknown): string {
    const off = !!raw && typeof raw === "object" && (raw as Record<string, unknown>).customBuyerWindowDays === 0;
    return off ? "No self-service refunds" : "Standard refunds";
}
