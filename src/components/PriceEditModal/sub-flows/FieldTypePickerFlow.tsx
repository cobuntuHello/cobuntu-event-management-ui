"use client";

import { ArrowLeft } from "lucide-react";
import {
  Type,
  AlignLeft,
  Mail,
  Phone,
  Hash,
  Link as LinkIcon,
  ChevronsUpDown,
  CircleDot,
  CheckSquare,
  Calendar,
  Star,
} from "lucide-react";
import { FIELD_TYPES, type FieldType } from "../_form-types";

const FIELD_ICONS: Record<FieldType, React.ComponentType<{ className?: string }>> = {
  SHORT_TEXT: Type,
  LONG_TEXT: AlignLeft,
  EMAIL: Mail,
  PHONE: Phone,
  NUMBER: Hash,
  URL: LinkIcon,
  DROPDOWN: ChevronsUpDown,
  SINGLE_CHOICE: CircleDot,
  MULTIPLE_CHOICE: CheckSquare,
  DATE: Calendar,
  RATING: Star,
};

export interface FieldTypePickerFlowProps {
  onPick: (type: FieldType) => void;
  onBack: () => void;
}

/**
 * Sub-step pushed from FormStep when the host adds a new question.
 * Renders the 11 field types in a grid; picking one returns the type
 * to the parent which constructs the blank field + opens the editor.
 *
 * Replaces the AddFieldModal that lived on the standalone /form page.
 * Per the user's redesign feedback: "Add a question should open its
 * own step - not be an expandable section."
 */
export function FieldTypePickerFlow({ onPick, onBack }: FieldTypePickerFlowProps) {
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
        <h5 className="text-[13px] font-semibold text-zinc-900">Add a question</h5>
      </div>
      <p className="text-[12px] text-zinc-500 mb-3">Choose a field type.</p>
      <div className="grid grid-cols-2 gap-2">
        {FIELD_TYPES.map((ft) => {
          const Icon = FIELD_ICONS[ft.type];
          return (
            <button
              key={ft.type}
              type="button"
              onClick={() => onPick(ft.type)}
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-zinc-50 transition-colors cursor-pointer border border-zinc-200 hover:border-zinc-300"
            >
              <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-500 shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-zinc-800">{ft.label}</p>
                <p className="text-[10px] text-zinc-400 truncate">{ft.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { FIELD_ICONS };
