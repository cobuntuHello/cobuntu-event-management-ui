"use client";

import { useEffect, useRef, useState } from "react";
import { RichTextEditor } from "../../ui/rich-text-editor";
import { useUpdateEvent } from "../../config";
import { useCanEdit } from "../../lib/manageAccess";
import { theme, muted } from "../../shared/theme";

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
 * ── Why the Save button waits for a change ─────────────────────────────────
 *
 * An inline editor with a permanently live Save invites the question "did I
 * change something?" every time it is seen. Enabling it only when the content
 * actually differs makes the button itself the answer, and doubles as the
 * unsaved-work indicator this page would otherwise lack — a modal at least
 * announced itself by being open.
 */

interface Props {
    event: any;
    communityTag: string;
    onSaved: () => void;
    showToast: (msg: string) => void;
}

export function DescriptionSection({ event, communityTag, onSaved, showToast }: Props) {
    const updateEvent = useUpdateEvent();
    /*
     * The package's own permission hook, not a prop. A carrying community's
     * leader can see a host's event and must not rewrite it — the same gate
     * the rest of this view uses, so the two cannot disagree about who may
     * edit what.
     */
    const canEdit = useCanEdit();
    const saved = event?.description || "";
    const [content, setContent] = useState(saved);
    const [saving, setSaving] = useState(false);

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

    const dirty = content !== saved;

    async function save() {
        setSaving(true);
        try {
            await updateEvent(communityTag, event.id, { description: content.trim() || null });
            showToast("Description updated");
            onSaved();
        } catch (e: any) {
            showToast(e?.message || "Failed to update description");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            className="p-5"
            style={{
                background: theme.cardBg,
                borderRadius: theme.cardRadius,
                border: `1px solid ${theme.borderSubtle}`,
            }}
        >
            <div className="flex items-center justify-between gap-4 mb-3">
                <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>Description</h2>
                    <p className="text-[12px] mt-0.5" style={muted(0.5)}>
                        What attendees read on the event page.
                    </p>
                </div>
                {canEdit && (
                    <button
                        type="button"
                        onClick={save}
                        disabled={!dirty || saving}
                        className="shrink-0 px-4 py-2 text-[13px] font-medium disabled:opacity-30 cursor-pointer hover:opacity-90"
                        style={{ background: theme.brand, color: theme.onBrand, borderRadius: theme.buttonRadius }}
                    >
                        {saving ? "Saving..." : "Save"}
                    </button>
                )}
            </div>

            {/*
              * Read-only is expressed by making the editor inert, not by
              * re-rendering the stored HTML ourselves.
              *
              * Injecting it with dangerouslySetInnerHTML would mean parsing
              * someone's stored markup on a page it was never rendered on
              * before, for no gain — the editor already displays exactly this
              * content through its own pipeline. `inert` blocks interaction
              * and takes it out of the tab order in one attribute.
              */}
            <div
                {...(canEdit ? {} : { inert: "" as any, "aria-readonly": true })}
                style={canEdit ? undefined : { opacity: 0.75 }}
            >
                <RichTextEditor
                    content={content}
                    onChange={setContent}
                    placeholder={canEdit ? "Describe your event..." : ""}
                />
            </div>
        </div>
    );
}
