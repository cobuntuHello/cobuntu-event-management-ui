"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { EventTags } from "../ui/event-tags";
import { useUpdateEvent } from "../config";
import { useEventT } from "../create-wizard/i18n";

/**
 * Edit the event's tags.
 *
 * Extracted from the legacy EditEventDrawer sub-modal so tags can be a
 * quick-edit card on EventCard alongside the other single-field edits.
 */

interface Props {
    event: any;
    communityTag: string;
    onClose: () => void;
    onSaved: () => void;
    showToast: (msg: string) => void;
}

export function TagsEditModal({ event, communityTag, onClose, onSaved, showToast }: Props) {
    const updateEvent = useUpdateEvent();
    const tr = useEventT("eventsUi.manageUi.tagsEditModal");
    const tc = useEventT("eventsUi.manageUi.overviewCommon");
    const initialTags = (event.tags || [])
        .map((t: any) => ({ id: t.id || t.tagId, name: t.name || t.tag?.name }))
        .filter((t: any) => t.id && t.name);
    const [tags, setTags] = useState<{ id: string; name: string }[]>(initialTags);
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            await updateEvent(communityTag, event.id, {
                tagIds: tags.map((t) => t.id),
            });
            showToast(tr("updated"));
            onSaved();
        } catch (e: any) {
            showToast(e?.message || tr("failed"));
        } finally {
            setSaving(false);
        }
    }

    return (
        <ModalShell onClose={onClose}>
            <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">{tr("title")}</h3>
            <p className="text-[12px] text-zinc-500 mb-4">{tr("subtitle")}</p>
            <div className="mb-4">
                <EventTags selectedTags={tags} onTagsChange={setTags} />
            </div>
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
