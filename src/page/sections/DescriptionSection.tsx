"use client";

import { useEffect, useRef, useState } from "react";
import { AutosaveStatus, useAutosave } from "@cobuntu/management-ui-shared";
import { MarkdownEditor } from "../../ui/markdown-editor";
import { useUpdateEvent } from "../../config";
import { useCanEdit } from "../../lib/manageAccess";
import { useEventT } from "../../create-wizard/i18n";

/**
 * The event's description, edited where it is read.
 *
 * ── Why this is not a row like the others ──────────────────────────────────
 *
 * It used to be one: a single truncated line that opened a modal. Client
 * feedback, and they were right — the other fields are a date, a price, a
 * slug, things you take in at a glance, so a compact row shows them
 * completely. A description is paragraphs. Truncated to one line it shows
 * almost nothing, so the row was a permanent instruction to click, and the
 * modal made reading it a separate act from reading the rest of the page.
 *
 * So the short fields keep their rows, and the one long field gets the space a
 * long field needs.
 *
 * ── Why there is no Save button ────────────────────────────────────────────
 *
 * There was one, alone above the editor, enabled once the text differed. It
 * made saving a step to remember on a field that is written in place, and an
 * edit left without pressing it was lost on the next tab or page. The
 * description now saves itself (useAutosave, shared with products and
 * courses): a pause in typing or leaving the field saves it, and the small
 * status beside the counter says "Saving...", "Saved", or "Couldn't save."
 * with Retry. A failed save never touches the text.
 *
 * Images added with "Add image" are part of the text (a markdown line), so
 * they save the same way.
 */

interface Props {
    event: any;
    communityTag: string;
    onSaved: () => void;
}

export function DescriptionSection({ event, communityTag, onSaved }: Props) {
    const updateEvent = useUpdateEvent();
    const t = useEventT("eventsUi.manageUi.descriptionSection");
    /*
     * The package's own permission hook, not a prop. A carrying community's
     * leader can see a host's event and must not rewrite it — the same gate
     * the rest of this view uses, so the two cannot disagree about who may
     * edit what. Read-only also means no saving and no status line.
     */
    const canEdit = useCanEdit();
    const saved = event?.description || "";
    const [content, setContent] = useState(saved);

    /*
     * Re-seed when the SAVED value changes underneath us — after our own save,
     * or when the page refetches the event — but NEVER while there is unsaved
     * work, which would silently discard what someone is part-way through
     * typing.
     *
     * Comparing against what we last seeded from, rather than against a
     * "dirty" flag, is what makes that distinction reliable: it says "the user
     * has not touched this since it last matched the server", which is exactly
     * when adopting a new server value is safe.
     */
    const seededFrom = useRef(saved);
    useEffect(() => {
        if (seededFrom.current === saved) return;
        setContent((prev: string) => (prev === seededFrom.current ? saved : prev));
        seededFrom.current = saved;
    }, [saved]);

    /*
     * What would be stored is the TRIMMED text (empty = null), so that is what
     * the hook compares: a trailing space or newline is not a change worth a
     * request, and an untrimmed stored value must not look edited on open.
     */
    const autosave = useAutosave({
        value: content.trim(),
        saved: saved.trim(),
        enabled: canEdit,
        save: async (description, { keepalive }) => {
            await updateEvent(communityTag, event.id, { description: description || null }, { keepalive });
            onSaved();
        },
    });

    return (
        <div>
            {/*
              * Read-only is expressed by making the editor inert, not by
              * re-rendering the stored markdown ourselves — it already
              * displays exactly this content through its own pipeline.
              * `inert` blocks interaction and takes it out of the tab order
              * in one attribute.
              */}
            <div
                {...(canEdit ? {} : { inert: "" as any, "aria-readonly": true })}
                style={canEdit ? undefined : { opacity: 0.75 }}
            >
                <MarkdownEditor
                    value={content}
                    onChange={setContent}
                    onBlur={autosave.flush}
                    placeholder={canEdit ? t("placeholder") : ""}
                    disabled={!canEdit}
                    status={canEdit ? <AutosaveStatus state={autosave.state} onRetry={autosave.retry} /> : undefined}
                />
            </div>
        </div>
    );
}
