"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Trash2, Plus } from "lucide-react";
import { fieldHasOptions, fieldTypeMeta, type FormField } from "../_form-types";
import { StepInput } from "../_primitives";
import { useEventT } from "../../../create-wizard/i18n";
import { PendingCommitContext } from "../footer-slot";

export interface EditFieldFlowProps {
  field: FormField;
  /** Whether this field was newly added (no Cancel/back-to-list yet — confirms via Save). */
  isNew?: boolean;
  onSave: (next: FormField) => void | Promise<void>;
  onDelete: () => void;
  onBack: () => void;
}

/**
 * Sub-step for editing one form field. Label + optional description +
 * required toggle, with an options list editor for the choice/dropdown
 * types. Replaces the EditFieldModal that lived on the standalone /form
 * page; pushes a step rather than overlaying a modal so navigation
 * matches the redesign sketch.
 */
export function EditFieldFlow({
  field,
  isNew = false,
  onSave,
  onDelete,
  onBack,
}: EditFieldFlowProps) {
  const [draft, setDraft] = useState<FormField>(field);

  // While this question is open, the modal's Save must commit it first: a new
  // question always (the host picked its type), an existing one only if it was
  // edited. Refs keep the registered callback stable while it reads the latest
  // draft. See PendingCommitContext.
  const registerPendingCommit = useContext(PendingCommitContext);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const typeLabelRef = useRef("");
  useEffect(() => {
    if (!registerPendingCommit) return;
    return registerPendingCommit(() => {
      if (!isNew && draftRef.current === field) return;
      return onSaveRef.current(withQuestionText(draftRef.current, typeLabelRef.current));
    });
  }, [registerPendingCommit, isNew, field]);

  // Shown when Add / Done is pressed with the question still empty.
  const [labelMissing, setLabelMissing] = useState(false);
  function confirm() {
    if (!draft.label.trim()) { setLabelMissing(true); return; }
    onSave({ ...draft, label: draft.label.trim() });
  }
  const t = useEventT("eventsUi.manageUi.formSubFlows");
  const meta = fieldTypeMeta(draft.type);
  typeLabelRef.current = meta?.label || draft.type;
  const showsOptions = fieldHasOptions(draft.type);
  const labelId = useId();
  const descriptionId = useId();

  function addOption() {
    const next = [...(draft.options || []), { id: `opt-${Date.now()}`, label: t("optionN", { n: (draft.options?.length || 0) + 1 }) }];
    setDraft({ ...draft, options: next });
  }
  function updateOption(idx: number, label: string) {
    const next = [...(draft.options || [])];
    next[idx] = { ...next[idx], label };
    setDraft({ ...draft, options: next });
  }
  function removeOption(idx: number) {
    const next = (draft.options || []).filter((_, i) => i !== idx);
    setDraft({ ...draft, options: next });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={onBack}
          className="p-1 -ml-1 text-zinc-500 hover:text-zinc-900 cursor-pointer rounded"
          aria-label={t("backToFields")}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h5 className="text-[13px] font-semibold text-zinc-900">
            {isNew ? t("newQuestion") : t("editQuestion")}
          </h5>
          <p className="text-[11px] text-zinc-400">{meta?.label || draft.type}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor={labelId} className="block text-[11px] font-medium text-zinc-600 mb-1">{t("label")}</label>
          <StepInput
            id={labelId}
            type="text"
            value={draft.label}
            onChange={(e) => { setDraft({ ...draft, label: e.target.value }); if (labelMissing) setLabelMissing(false); }}
            placeholder={t("labelPlaceholder")}
            aria-invalid={labelMissing || undefined}
            autoFocus
          />
          {labelMissing && (
            <p role="alert" className="mt-1 text-[11px] text-red-600">{t("labelRequired")}</p>
          )}
        </div>

        <div>
          <label htmlFor={descriptionId} className="block text-[11px] font-medium text-zinc-600 mb-1">{t("helpText")}</label>
          <StepInput
            id={descriptionId}
            type="text"
            value={draft.description || ""}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder={t("helpTextPlaceholder")}
          />
        </div>

        <label className="flex items-center justify-between py-1 cursor-pointer">
          <span className="text-[12px] font-medium text-zinc-700">{t("required")}</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setDraft({ ...draft, required: !draft.required });
            }}
            aria-pressed={draft.required}
            aria-label={t("toggleRequired")}
            className={`w-10 h-[22px] rounded-full relative transition-colors cursor-pointer ${draft.required ? "bg-zinc-900" : "bg-zinc-200"}`}
          >
            <span
              className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform"
              style={{ transform: draft.required ? "translateX(20px)" : "translateX(2px)" }}
            />
          </button>
        </label>

        {showsOptions && (
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 mb-1.5">{t("options")}</label>
            <div className="space-y-1.5">
              {(draft.options || []).map((opt, oi) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => updateOption(oi, e.target.value)}
                    className="flex-1 px-3 py-1.5 text-[12px] text-zinc-900 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
                  />
                  {(draft.options?.length ?? 0) > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOption(oi)}
                      className="p-1 text-zinc-300 hover:text-red-500 cursor-pointer"
                      aria-label={t("removeOption")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addOption}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> {t("addOption")}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100">
        {!isNew ? (
          <button
            type="button"
            onClick={onDelete}
            className="px-3 py-1.5 text-[12px] font-medium text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
          >
            {t("remove")}
          </button>
        ) : <span />}
        <button
          type="button"
          onClick={confirm}
          className="px-3 py-1.5 text-[12px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
        >
          {isNew ? t("addQuestion") : t("done")}
        </button>
      </div>
    </div>
  );
}

/**
 * The field as it should be committed when the modal's Save flushes an open
 * question (see PendingCommitContext). A question with no text of its own
 * takes its help text, which is where a host who skipped the question box
 * wrote it; failing that, the type name, as before, so nothing is dropped.
 */
export function withQuestionText(f: FormField, typeLabel: string): FormField {
  if (f.label.trim()) return { ...f, label: f.label.trim() };
  const help = (f.description ?? "").trim();
  if (help) return { ...f, label: help, description: undefined };
  return { ...f, label: typeLabel || f.type };
}
