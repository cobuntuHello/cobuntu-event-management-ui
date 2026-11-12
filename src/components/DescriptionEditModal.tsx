"use client";

import { useState } from "react";
import { DescriptionDialog } from "@cobuntu/management-ui-shared";
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
    const [saving, setSaving] = useState(false);

    async function save(content: string) {
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
        <DescriptionDialog
            open
            title="Edit description"
            value={event.description || ""}
            placeholder="Describe your event..."
            cancelLabel="Cancel"
            doneLabel="Save"
            busy={saving}
            busyLabel="Saving..."
            onCancel={onClose}
            onDone={(next) => void save(next)}
        />
    );
}
