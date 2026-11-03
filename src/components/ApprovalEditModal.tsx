"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useUpdateEvent } from "../config";
import { useEventT } from "../create-wizard/i18n";

/**
 * Edit `events.requiresApproval` — whether a registration lands as pending
 * and waits for the host, or is confirmed on the spot.
 *
 * This was settable exactly once, in the create form, and then nowhere: the
 * manage page only ever READ it (to decide whether the Attendees tab shows a
 * pending queue). A host who got it wrong at creation had no way back.
 *
 * It is the host's own call, not the community's — the backend leaves it out
 * of COMMUNITY_SCOPED_EVENT_FIELDS, so a personal event's owner may set it
 * exactly like a leader may. That is why it belongs in this drawer and not
 * behind the community-owned gate.
 */

interface Props {
    event: any;
    communityTag: string;
    onClose: () => void;
    onSaved: () => void;
    showToast: (msg: string) => void;
}

export function ApprovalEditModal({ event, communityTag, onClose, onSaved, showToast }: Props) {
    const updateEvent = useUpdateEvent();
    const t = useEventT("eventsUi.manageUi.approvalEditModal");
    const tc = useEventT("eventsUi.manageUi.overviewCommon");
    const [value, setValue] = useState<boolean>(!!event.requiresApproval);
    const [saving, setSaving] = useState(false);

    /*
     * Turning approval OFF does not retroactively admit whoever is already
     * waiting — those rows keep their pending state and still need a decision.
     * Say so, rather than let the host assume the queue drained.
     */
    const pendingCount = Number(event?.pendingAttendeeCount ?? 0);
    const willStrandPending = !value && !!event.requiresApproval && pendingCount > 0;

    async function save() {
        setSaving(true);
        try {
            await updateEvent(communityTag, event.id, { requiresApproval: value });
            showToast(value ? t("nowNeedApproval") : t("nowInstant"));
            onSaved();
        } catch (e: any) {
            showToast(e?.message || t("failed"));
        } finally {
            setSaving(false);
        }
    }

    return (
        <ModalShell onClose={onClose}>
            <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">{t("title")}</h3>
            <p className="text-[12px] text-zinc-500 mb-4">{t("subtitle")}</p>

            <div className="space-y-2 mb-4">
                <RadioRow
                    selected={!value}
                    onClick={() => setValue(false)}
                    title={t("instantTitle")}
                    subtitle={t("instantBody")}
                />
                <RadioRow
                    selected={value}
                    onClick={() => setValue(true)}
                    title={t("reviewTitle")}
                    subtitle={t("reviewBody")}
                />
            </div>

            {willStrandPending && (
                <p className="text-[12px] text-amber-600 mb-4 leading-snug">
                    {t("strandPending", { count: pendingCount })}
                </p>
            )}

            <div className="flex justify-end gap-2">
                <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">{tc("cancel")}</button>
                <button
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                >
                    {saving ? tc("savingDots") : tc("save")}
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
            className={`w-full text-left px-3.5 py-3 rounded-xl border transition-colors cursor-pointer ${
                selected ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300"
            }`}
        >
            <div className="flex items-center gap-2.5">
                <span
                    className={`w-4 h-4 rounded-full border-[5px] shrink-0 transition-colors ${
                        selected ? "border-zinc-900" : "border-zinc-200"
                    }`}
                />
                <span className="text-[13px] font-medium text-zinc-900">{title}</span>
            </div>
            <p className="text-[12px] text-zinc-500 mt-1 ml-[26px]">{subtitle}</p>
        </button>
    );
}
