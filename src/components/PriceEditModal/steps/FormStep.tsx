"use client";

import { FileText, ArrowUpRight } from "lucide-react";
import type { DraftTier } from "../types";

export interface FormStepProps {
  t: DraftTier;
  /** Each consumer app has a different URL pattern for the form editor
   *  (admin uses a query param; community-app uses a sub-route), so
   *  the navigation is injected. */
  onOpenForm?: (tierId: string) => void;
  showToast: (msg: string) => void;
}

/**
 * "Form" step — links to the per-tier registration form builder.
 *
 * Slice 5 stub: opens the existing standalone form-builder page via
 * onOpenForm. Slice 6 inlines the builder directly into this step,
 * deleting /events/[id]?view=form + /marketplace/[id]/form. Tracked
 * in docs/features/price-modal-redesign.md.
 */
export function FormStep({ t, onOpenForm, showToast }: FormStepProps) {
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

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-zinc-200 bg-white">
        <FileText className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-zinc-900">
            Registration form
            {t.hasForm && (
              <span className="ml-2 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                {t.formFieldCount} field{t.formFieldCount !== 1 ? "s" : ""} · Linked
              </span>
            )}
          </p>
          <p className="text-[12px] text-zinc-500 mt-0.5">
            {t.hasForm
              ? "Edit the questions attendees fill out at this tier."
              : "Add custom questions attendees fill out at this tier."}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          if (onOpenForm) onOpenForm(t.id!);
          else showToast("Form editing not available in this surface");
        }}
        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-[13px] font-medium text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
      >
        {t.hasForm ? "Manage form" : "Add form"}
        <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
      </button>

      <p className="text-[11px] text-zinc-400 text-center">
        The form builder opens in a separate page for now. The inline
        builder ships in a follow-up commit.
      </p>
    </div>
  );
}
