"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { RichTextEditor } from "../ui/rich-text-editor";
import { useUpdateEvent } from "../config";

/**
 * Edit `events.description` (rich text).
 *
 * Extracted from the legacy EditEventDrawer sub-modal into a standalone
 * modal so the row can live as a quick-edit card on the EventCard
 * (single-field edit pattern), matching the rest of the quick-edit set
 * (name, slug, location, date, pricing, banner).
 */

interface Props {
    event: any;
    communityTag: string;
    onClose: () => void;
    onSaved: () => void;
    showToast: (msg: string) => void;
}

export function DescriptionEditModal({ event, communityTag, onClose, onSaved, showToast }: Props) {
    const updateEvent = useUpdateEvent();
    const [content, setContent] = useState(event.description || "");
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            await updateEvent(communityTag, event.id, {
                description: content.trim() || null,
            });
            showToast("Description updated");
            onSaved();
        } catch (e: any) {
            showToast(e?.message || "Failed to update description");
        } finally {
            setSaving(false);
        }
    }

    return (
        <ModalShell onClose={onClose}>
            <h3 className="text-[15px] font-semibold text-zinc-900 mb-4">Edit description</h3>
            <div className="mb-4 max-h-[60vh] overflow-y-auto">
                <RichTextEditor
                    content={content}
                    onChange={setContent}
                    placeholder="Describe your event..."
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
