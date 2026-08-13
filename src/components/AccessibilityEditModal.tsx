"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useUpdateEvent } from "../config";
import {
    MembershipTierPicker,
    toTierAccessValue,
    fromTierAccessValue,
    ceilingFor,
    type TierAccessValue,
} from "@cobuntu/management-ui-shared";

/**
 * Edit `events.accessibility` — who can RSVP for / purchase tickets
 * to the event.
 *
 *   PUBLIC       → any visitor can register
 *   MEMBERS_ONLY → only ACCEPTED community members can register
 *
 * Paired with ViewabilityEditModal (the SEE gate, separate axis).
 *
 * Note: with accessibility=MEMBERS_ONLY, the membership funnel feature
 * does not fire — there are no non-members to convert. See the funnel
 * plan doc in cobuntu-backend-monorepo/docs/features/.
 */

interface Props {
    event: any;
    /** The community's membership tiers, for the picker. */
    membershipTiers?: { id: string; name: string }[];
    /** Tier ids currently granted this axis. */
    initialTierIds?: string[];
    /*
     * Tier ids granted the VIEW axis.
     *
     * Registering is a subset of seeing, and this modal edits one axis - so it
     * has to be told what the stored viewability already allows, or it would
     * offer "anyone can register" on an event only one tier can find.
     */
    viewTierIds?: string[];
    communityTag: string;
    onClose: () => void;
    onSaved: () => void;
    showToast: (msg: string) => void;
}

export function AccessibilityEditModal({ event, communityTag, onClose, onSaved, showToast, membershipTiers = [], initialTierIds, viewTierIds }: Props) {
    const updateEvent = useUpdateEvent();
    /*
     * MEMBERS_ONLY with no granted tiers reads as "all members", never as an
     * empty selection - so every event that predates tier access opens here
     * correctly instead of with nothing ticked.
     */
    const [access, setAccess] = useState<TierAccessValue>(
        toTierAccessValue(event.accessibility ?? "PUBLIC", initialTierIds),
    );
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            const resolved = fromTierAccessValue(access);
            await updateEvent(communityTag, event.id, {
                accessibility: resolved.visibility,
                buyTierIds: resolved.tierIds,
            });
            showToast("Access updated");
            onSaved();
        } catch (e: any) {
            showToast(e?.message || "Failed to update access");
        } finally {
            setSaving(false);
        }
    }

    return (
        <ModalShell onClose={onClose}>
            <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Access</h3>
            <p className="text-[12px] text-zinc-500 mb-4">Who can register / RSVP for this event.</p>

            {/* The same picker the create form uses. Public and All members are
                shortcuts that imply every membership tier below them; implied
                rows carry an "Included" tag rather than a checkbox that would
                have to refuse the click. */}
            <div className="mb-4">
                <MembershipTierPicker
                    value={access}
                    onChange={setAccess}
                    tiers={membershipTiers}
                    ceiling={ceilingFor(toTierAccessValue(event?.viewability ?? "PUBLIC", viewTierIds))}
                />
            </div>

            <div className="flex justify-end gap-2">
                <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
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
