"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { StepInput } from "../_primitives";

export interface EditPageBreakFlowProps {
  /** Existing label when editing; empty when creating. */
  initialLabel: string;
  /** True when editing an existing page break — exposes Remove. */
  isEdit: boolean;
  onSave: (label: string) => void;
  onDelete: () => void;
  onBack: () => void;
}

/**
 * Sub-step for adding or editing a form page break. Page breaks split
 * the form into multiple submission pages — useful for long signups.
 *
 * Replaces the PageBreakModal that lived on the standalone /form page.
 */
export function EditPageBreakFlow({
  initialLabel,
  isEdit,
  onSave,
  onDelete,
  onBack,
}: EditPageBreakFlowProps) {
  const [label, setLabel] = useState(initialLabel);

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
            {isEdit ? "Edit page break" : "Add page break"}
          </h5>
          <p className="text-[11px] text-zinc-400">
            Split the form into multiple pages.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-zinc-600 mb-1">Page title (optional)</label>
        <StepInput
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Tell us about your business"
          autoFocus
        />
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100">
        {isEdit ? (
          <button
            type="button"
            onClick={onDelete}
            className="px-3 py-1.5 text-[12px] font-medium text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
          >
            Remove page break
          </button>
        ) : <span />}
        <button
          type="button"
          onClick={() => onSave(label)}
          className="px-3 py-1.5 text-[12px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
        >
          {isEdit ? "Done" : "Add page break"}
        </button>
      </div>
    </div>
  );
}
