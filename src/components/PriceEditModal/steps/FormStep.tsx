"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripVertical, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEventManagementConfig, useJsonHeaders } from "../../../config";
import type { DraftTier } from "../types";
import {
  fieldTypeMeta,
  isSeparator,
  itemsToPayload,
  makeBlankField,
  makeBlankSeparator,
  payloadToItems,
  type FieldType,
  type FormField,
  type Item,
  type Separator,
} from "../_form-types";
import { FieldTypePickerFlow, FIELD_ICONS } from "../sub-flows/FieldTypePickerFlow";
import { EditFieldFlow } from "../sub-flows/EditFieldFlow";
import { EditPageBreakFlow } from "../sub-flows/EditPageBreakFlow";
import { FooterSlotContext } from "../footer-slot";

export interface FormStepProps {
  t: DraftTier;
  communityTag: string;
  showToast: (msg: string) => void;
  /**
   * Draft mode: the tier does not exist server-side yet, so there is nothing
   * to GET or PUT against. The builder reads t.draftForm and reports every
   * change up through onDraftFormChange; the form ships inline with the tier
   * in the create payload.
   */
  draftMode?: boolean;
  onDraftFormChange?: (form: { fields: any[]; stepLabels?: string[] } | null) => void;
}

type SubView =
  | { kind: "list" }
  | { kind: "add-field" }
  | { kind: "edit-field"; field: FormField; isNew: boolean }
  | { kind: "edit-page-break"; sep?: Separator };

/**
 * Inline form-builder step. Replaces the standalone /form page and
 * the FileText footer the legacy modal used to ship.
 *
 * Behaviors preserved from the standalone page:
 * - Per-tier form: loads GET /tiers/:tierId/form, PUTs the same path.
 * - Auto-save on every change (add, edit, delete, reorder, page break,
 *   page label). No outer Save button is needed for the form fields;
 *   the outer modal's Save still owns the tier writes + member-pricing
 *   commits independently.
 * - 11 field types with type-specific options editors for the choice
 *   types (DROPDOWN, SINGLE_CHOICE, MULTIPLE_CHOICE).
 * - Drag-to-reorder via dnd-kit.
 * - Page break separators that split the form into multiple submission
 *   pages.
 * - Email-required warning when no EMAIL field exists.
 *
 * Sub-flows (Add question / Edit question / Edit page break) push as
 * step views inside the FormStep rather than overlay modals — per the
 * user's redesign feedback ("Add a question should open its own step").
 */
export function FormStep({ t, communityTag, showToast, draftMode, onDraftFormChange }: FormStepProps) {
  const { apiBaseUrl, authHeaders } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();
  // The form builder's primary actions live in the modal footer, not in
  // the body — portaled into this slot. See ../footer-slot.tsx.
  const footerSlot = useContext(FooterSlotContext);

  const [items, setItems] = useState<Item[]>([]);
  const [step0Label, setStep0Label] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<SubView>({ kind: "list" });

  // Concurrent-save guard. The form auto-saves on every mutation
  // (add / edit / delete / reorder / page-break / page-label) which
  // means two rapid actions can fire two PUTs in flight at once. If
  // the second action's request body is built from state that the
  // first request hasn't yet returned for, the responses race and the
  // second PUT can clobber the first. We coalesce instead: when a
  // save is already in flight, queue the latest snapshot and replay
  // it once the in-flight call resolves. The queue only keeps the
  // *most recent* pending snapshot — earlier queued snapshots are
  // strictly stale.
  const inFlightRef = useRef(false);
  const pendingRef = useRef<{ items: Item[]; step0Label: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fieldsFlat = useMemo(
    () => items.filter((i) => !isSeparator(i)) as FormField[],
    [items],
  );
  const hasEmail = useMemo(
    () => fieldsFlat.some((f) => f.type === "EMAIL"),
    [fieldsFlat],
  );

  const stepAssignment = useMemo(() => {
    let cur = 0;
    return items.map((it) => {
      if (isSeparator(it)) {
        cur += 1;
        return cur;
      }
      return cur;
    });
  }, [items]);

  useEffect(() => {
    // Draft mode: seed from the parent-owned draft. Runs once per tier —
    // re-seeding on every draftForm change would clobber what the user is
    // typing, since we are also the thing producing those changes.
    if (draftMode) {
      const { items: rebuilt, step0Label: s0 } = payloadToItems(
        t.draftForm?.fields ?? [],
        t.draftForm?.stepLabels ?? [],
      );
      setItems(rebuilt);
      setStep0Label(s0);
      return;
    }
    if (!t.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/api/communities/${communityTag}/tiers/${t.id}/form`,
          { headers: authHeaders() },
        );
        if (cancelled) return;
        if (res.ok) {
          const formData = await res.json().catch(() => null);
          const fields: FormField[] = formData?.formData?.fields || formData?.fields || [];
          const stepLabels: string[] = formData?.formData?.stepLabels || formData?.stepLabels || [];
          const { items: rebuilt, step0Label: s0 } = payloadToItems(fields, stepLabels);
          setItems(rebuilt);
          setStep0Label(s0);
        } else if (res.status === 404) {
          setItems([]);
          setStep0Label("");
        } else {
          setLoadError("Failed to load form");
        }
      } catch {
        if (!cancelled) setLoadError("Failed to load form");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id, communityTag, apiBaseUrl]);

  async function persist(nextItems: Item[], nextStep0Label: string) {
    if (!t.id) return;
    // If a save is already in flight, stash the latest snapshot and
    // bail. The in-flight call will replay the stashed snapshot in
    // its finally block, so the most recent user intent always wins.
    if (inFlightRef.current) {
      pendingRef.current = { items: nextItems, step0Label: nextStep0Label };
      return;
    }
    const { fields, stepLabels } = itemsToPayload(nextItems, nextStep0Label);

    // Draft mode: no tier to PUT against. Hand the payload up and let the
    // create request carry it. Synchronous, so none of the in-flight
    // coalescing below applies — there is no request to race.
    if (draftMode) {
      onDraftFormChange?.(fields.length > 0 ? { fields, stepLabels } : null);
      return;
    }

    inFlightRef.current = true;
    setSaving(true);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/communities/${communityTag}/tiers/${t.id}/form`,
        {
          method: "PUT",
          headers: jsonHeaders(),
          body: JSON.stringify({ fields, stepLabels }),
        },
      );
      if (!res.ok) showToast("Failed to save form");
    } catch {
      showToast("Failed to save form");
    } finally {
      inFlightRef.current = false;
      setSaving(false);
      // Drain the most recent stashed snapshot, if any. Coalescing
      // means only one replay regardless of how many calls landed
      // while we were in flight.
      const queued = pendingRef.current;
      pendingRef.current = null;
      if (queued) {
        // Fire-and-forget — recursion goes at most one level deep
        // because the guard above will requeue any further calls.
        void persist(queued.items, queued.step0Label);
      }
    }
  }

  function commitFieldAdd(type: FieldType) {
    const blank = makeBlankField(type);
    setView({ kind: "edit-field", field: blank, isNew: true });
  }

  function commitFieldSave(next: FormField, isNew: boolean) {
    const updated = isNew
      ? [...items, next as Item]
      : items.map((i) => (i.id === next.id ? (next as Item) : i));
    setItems(updated);
    setView({ kind: "list" });
    persist(updated, step0Label);
  }

  function commitFieldDelete(fieldId: string) {
    const updated = items.filter((i) => i.id !== fieldId);
    setItems(updated);
    setView({ kind: "list" });
    persist(updated, step0Label);
  }

  function commitSeparatorSave(label: string, existing?: Separator) {
    const updated = existing
      ? items.map((i) =>
          i.id === existing.id && isSeparator(i) ? { ...i, label } : i,
        )
      : [...items, makeBlankSeparator(label)];
    setItems(updated);
    setView({ kind: "list" });
    persist(updated, step0Label);
  }

  function commitSeparatorDelete(sepId: string) {
    const updated = items.filter((i) => i.id !== sepId);
    setItems(updated);
    setView({ kind: "list" });
    persist(updated, step0Label);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const updated = arrayMove(items, oldIdx, newIdx);
    setItems(updated);
    persist(updated, step0Label);
  }

  function handleStep0LabelChange(value: string) {
    setStep0Label(value);
    persist(items, value);
  }

  function seedDefault() {
    const defaults: FormField[] = [
      { id: `field-${Date.now()}-1`, type: "SHORT_TEXT", label: "Name", required: true },
      { id: `field-${Date.now()}-2`, type: "EMAIL", label: "Email", required: true },
    ];
    setItems(defaults as Item[]);
    persist(defaults as Item[], step0Label);
  }

  // ─── Gates ────────────────────────────────────────────────────────

  if (!t.id) {
    return (
      <div className="px-4 py-6 rounded-lg border border-dashed border-zinc-300 text-center">
        <p className="text-[12px] font-medium text-zinc-700">Save tier first</p>
        <p className="text-[11px] text-zinc-500 mt-1">
          {t.sourceTierId
            ? `The form will copy from "${t.sourceTierName || "the source tier"}" when you save.`
            : "Forms are attached to saved tiers. Save once, then come back here."}
        </p>
      </div>
    );
  }

  if (loadError) {
    return <p className="text-[12px] text-red-600">{loadError}</p>;
  }

  // ─── Sub-views ────────────────────────────────────────────────────

  if (view.kind === "add-field") {
    return (
      <FieldTypePickerFlow
        onPick={commitFieldAdd}
        onBack={() => setView({ kind: "list" })}
      />
    );
  }

  if (view.kind === "edit-field") {
    return (
      <EditFieldFlow
        field={view.field}
        isNew={view.isNew}
        onSave={(next) => commitFieldSave(next, view.isNew)}
        onDelete={() => commitFieldDelete(view.field.id)}
        onBack={() => setView({ kind: "list" })}
      />
    );
  }

  if (view.kind === "edit-page-break") {
    return (
      <EditPageBreakFlow
        initialLabel={view.sep?.label ?? ""}
        isEdit={!!view.sep}
        onSave={(label) => commitSeparatorSave(label, view.sep)}
        onDelete={() => view.sep && commitSeparatorDelete(view.sep.id)}
        onBack={() => setView({ kind: "list" })}
      />
    );
  }

  // ─── Default list view ────────────────────────────────────────────

  return (
    <div>
      {/* Primary actions (Add question / Page break / Use default) live
          in the modal footer — portaled into the shared footer slot so
          the body stays button-free. Only rendered for the list view
          (the sub-flow early-returns above never reach here). */}
      {footerSlot && createPortal(
        items.length === 0 ? (
          <>
            <button
              type="button"
              onClick={seedDefault}
              className="px-3 py-2 text-[13px] font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
            >
              Use default
            </button>
            <button
              type="button"
              onClick={() => setView({ kind: "add-field" })}
              className="px-3 py-2 text-[13px] font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
            >
              Add question
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setView({ kind: "edit-page-break" })}
              className="px-3 py-2 text-[13px] font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
            >
              + Page break
            </button>
            <button
              type="button"
              onClick={() => setView({ kind: "add-field" })}
              className="px-3 py-2 text-[13px] font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
            >
              + Question
            </button>
          </>
        ),
        footerSlot,
      )}

      <div className="flex items-center mb-3">
        <p className="text-[12px] text-zinc-500">
          {fieldsFlat.length === 0
            ? "No questions yet."
            : `${fieldsFlat.length} question${fieldsFlat.length === 1 ? "" : "s"}.`}
          {saving && <span className="ml-2 text-zinc-400">Saving…</span>}
        </p>
      </div>

      {fieldsFlat.length > 0 && !hasEmail && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
          No Email field. Applicants can't be identified — add an Email question before going live.
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-8 text-center">
          <p className="text-[13px] font-medium text-zinc-700 mb-1">No questions yet</p>
          <p className="text-[11px] text-zinc-400">
            Use the footer to start with the default Name + Email, or add questions one-by-one.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          {/* Page 1 label header */}
          <div className="flex items-center gap-3 px-3 py-2 bg-zinc-50 border-b border-zinc-100">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 shrink-0">Page 1</span>
            <input
              type="text"
              value={step0Label}
              onChange={(e) => handleStep0LabelChange(e.target.value)}
              placeholder="Page title (optional)"
              className="flex-1 bg-transparent border-none outline-none text-[12px] font-medium text-zinc-700 placeholder:text-zinc-300"
            />
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item, i) => {
                if (isSeparator(item)) {
                  return (
                    <SortableSeparatorRow
                      key={item.id}
                      sep={item}
                      stepNumber={(stepAssignment[i] ?? 0) + 1}
                      onEdit={() => setView({ kind: "edit-page-break", sep: item })}
                    />
                  );
                }
                let fieldIndex = 0;
                for (let k = 0; k <= i; k++) {
                  if (!isSeparator(items[k]) && stepAssignment[k] === stepAssignment[i]) {
                    fieldIndex += 1;
                  }
                }
                return (
                  <SortableFieldRow
                    key={item.id}
                    field={item as FormField}
                    index={fieldIndex - 1}
                    onEdit={() =>
                      setView({ kind: "edit-field", field: item as FormField, isNew: false })
                    }
                    onRemove={() => commitFieldDelete(item.id)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

// ─── Sortable rows ──────────────────────────────────────────────────

function SortableFieldRow({
  field,
  index,
  onEdit,
  onRemove,
}: {
  field: FormField;
  index: number;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const Icon = FIELD_ICONS[field.type as keyof typeof FIELD_ICONS];
  const meta = fieldTypeMeta(field.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onEdit}
      className="flex items-center gap-3 px-3 py-2.5 border-b border-zinc-100 last:border-none hover:bg-zinc-50 transition-colors cursor-pointer"
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 shrink-0 touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className="text-[10px] font-bold text-zinc-300 w-4 text-right">{index + 1}</span>
      <div className="w-7 h-7 rounded-md bg-zinc-100 flex items-center justify-center text-zinc-500 shrink-0">
        {Icon ? <Icon className="w-3.5 h-3.5" /> : <span className="text-[10px]">?</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-medium text-zinc-900 truncate">{field.label}</p>
          {field.required && (
            <span className="text-[9px] font-medium text-red-400 bg-red-50 px-1.5 py-0.5 rounded">Required</span>
          )}
        </div>
        <p className="text-[10px] text-zinc-400 truncate">
          {meta?.label || field.type}
          {field.description ? ` · ${field.description}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="p-1 text-zinc-300 hover:text-red-500 cursor-pointer shrink-0"
        aria-label={`Remove ${field.label}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function SortableSeparatorRow({
  sep,
  stepNumber,
  onEdit,
}: {
  sep: Separator;
  stepNumber: number;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sep.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onEdit}
      className="flex items-center gap-3 px-3 py-2 bg-zinc-50 border-b border-zinc-100 last:border-none hover:bg-zinc-100 transition-colors cursor-pointer"
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 shrink-0 touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 shrink-0">
        Page {stepNumber}
      </span>
      <span className="flex-1 text-[12px] font-medium text-zinc-700 truncate">
        {sep.label || <span className="text-zinc-300 font-normal">Untitled page</span>}
      </span>
      <span className="text-[10px] text-zinc-400 shrink-0">Edit</span>
    </div>
  );
}
