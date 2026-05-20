"use client";

import { useId, useState } from "react";
import { ArrowLeft, Trash2, Plus } from "lucide-react";
import { fieldHasOptions, fieldTypeMeta, type FormField } from "../_form-types";
import { StepInput } from "../_primitives";

export interface EditFieldFlowProps {
  field: FormField;
  /** Whether this field was newly added (no Cancel/back-to-list yet — confirms via Save). */
  isNew?: boolean;
  onSave: (next: FormField) => void;
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
  const meta = fieldTypeMeta(draft.type);
  const showsOptions = fieldHasOptions(draft.type);
  const labelId = useId();
  const descriptionId = useId();

  function addOption() {
    const next = [...(draft.options || []), { id: `opt-${Date.now()}`, label: `Option ${(draft.options?.length || 0) + 1}` }];
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
          aria-label="Back to form fields"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h5 className="text-[13px] font-semibold text-zinc-900">
            {isNew ? "New question" : "Edit question"}
          </h5>
          <p className="text-[11px] text-zinc-400">{meta?.label || draft.type}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor={labelId} className="block text-[11px] font-medium text-zinc-600 mb-1">Label</label>
          <StepInput
            id={labelId}
            type="text"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="What should the question read?"
            autoFocus
          />
        </div>

        <div>
          <label htmlFor={descriptionId} className="block text-[11px] font-medium text-zinc-600 mb-1">Help text (optional)</label>
          <StepInput
            id={descriptionId}
            type="text"
            value={draft.description || ""}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Shown below the field"
          />
        </div>

        <label className="flex items-center justify-between py-1 cursor-pointer">
          <span className="text-[12px] font-medium text-zinc-700">Required</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setDraft({ ...draft, required: !draft.required });
            }}
            aria-pressed={draft.required}
            aria-label="Toggle required"
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
            <label className="block text-[11px] font-medium text-zinc-600 mb-1.5">Options</label>
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
                      aria-label="Remove option"
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
                <Plus className="w-3 h-3" /> Add option
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
            Remove
          </button>
        ) : <span />}
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="px-3 py-1.5 text-[12px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
        >
          {isNew ? "Add question" : "Done"}
        </button>
      </div>
    </div>
  );
}
