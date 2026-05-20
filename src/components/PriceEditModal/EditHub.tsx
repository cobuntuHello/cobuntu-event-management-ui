"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { SectionCard } from "@cobuntu/management-ui-shared";
import { MemberPricingSection, type MemberPricingSectionHandle } from "../MemberPricingSection";
import type { DraftTier } from "./types";
import { getSymbol, isTierLocked } from "./helpers";
import { BasicsStep } from "./steps/BasicsStep";
import { OptionsStep } from "./steps/OptionsStep";
import { MembersStep } from "./steps/MembersStep";
import { FormStep } from "./steps/FormStep";

type StepId = "basics" | "options" | "members" | "form";

export interface EditHubProps {
  t: DraftTier;
  communityTag: string;
  onUpdate: (patch: Partial<DraftTier>) => void;
  /** Community-only — admin sets true, community-app /manage omits. */
  showMemberPricing: boolean;
  /** Imperative ref registration so the outer modal can call
   *  commit()/isDirty() on this tier's MemberPricingSection during its
   *  global Save loop. */
  registerMemberPricingRef?: (tierId: string, handle: MemberPricingSectionHandle | null) => void;
  onOpenForm?: (tierId: string) => void;
  showToast: (msg: string) => void;
}

/**
 * The redesigned tier-edit surface. Renders as a "hub" of four section
 * cards (Basics / Options / Members / Form) when no step is selected.
 * Clicking a card pushes that step into the in-card "stack" — only
 * one step is mounted at a time, with a Back arrow returning to the
 * hub. The outer modal's single Save button commits everything.
 *
 * MemberPricingSection still mounts here (inside MembersStep) so its
 * imperative commit() handle registers with the parent modal's ref
 * map. Switching to a different step unmounts the section — which
 * would lose the dirty handle — so MembersStep keeps the section
 * mounted while the user is on any step. (Done via the same component
 * tree below the hub view, just visually hidden when not on the
 * Members step.)
 */
export function EditHub({
  t,
  communityTag,
  onUpdate,
  showMemberPricing,
  registerMemberPricingRef,
  onOpenForm,
  showToast,
}: EditHubProps) {
  const [activeStep, setActiveStep] = useState<StepId | null>(null);
  const sym = getSymbol(t.currency);
  const locked = isTierLocked(t);

  const priceDisplay = t.price && parseFloat(t.price) > 0 ? `${sym}${t.price}` : "Free";

  if (activeStep) {
    return (
      <div className="border-t border-zinc-100">
        {/* Sub-step header — Back arrow + step title */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-zinc-100 bg-zinc-50/50">
          <button
            type="button"
            onClick={() => setActiveStep(null)}
            className="p-1 -ml-1 text-zinc-500 hover:text-zinc-900 cursor-pointer rounded"
            aria-label="Back to hub"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h4 className="text-[13px] font-semibold text-zinc-900">
            {activeStep === "basics" && "Basics"}
            {activeStep === "options" && "Options"}
            {activeStep === "members" && "Member pricing"}
            {activeStep === "form" && "Registration form"}
          </h4>
        </div>

        <div className="px-4 py-4">
          {/* Keep MembersStep mounted so MemberPricingSection's imperative
              handle stays registered with the outer modal's ref map across
              step switches. Other steps swap freely. */}
          <div className={activeStep === "basics" ? "" : "hidden"}>
            <BasicsStep t={t} onUpdate={onUpdate} />
          </div>
          <div className={activeStep === "options" ? "" : "hidden"}>
            <OptionsStep t={t} onUpdate={onUpdate} />
          </div>
          {showMemberPricing && (
            <div className={activeStep === "members" ? "" : "hidden"}>
              <MembersStep
                t={t}
                communityTag={communityTag}
                registerMemberPricingRef={registerMemberPricingRef}
                showToast={showToast}
              />
            </div>
          )}
          <div className={activeStep === "form" ? "" : "hidden"}>
            <FormStep t={t} onOpenForm={onOpenForm} showToast={showToast} />
          </div>
        </div>

        {/* Footer — Done returns to the hub. Save lives on the outer modal. */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-zinc-100 bg-zinc-50/50">
          <button
            type="button"
            onClick={() => setActiveStep(null)}
            className="px-3 py-1.5 text-[13px] font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-100 p-4 space-y-2">
      {locked && (
        <div className="flex items-start gap-2 px-3 py-2 -mx-1 mb-1 rounded-lg bg-amber-50/70 border border-amber-100">
          <Lock className="w-3.5 h-3.5 mt-0.5 text-amber-600 shrink-0" />
          <p className="text-[12px] text-amber-700">
            <span className="font-medium">{t.salesCount} ticket{t.salesCount !== 1 ? "s" : ""} sold</span>
            {" — price, currency, and installment plan are locked. Refund all sales first to change them."}
          </p>
        </div>
      )}

      {/* Mount MemberPricingSection (via MembersStep) at the hub level
          when showMemberPricing is true so its imperative commit() handle
          is registered with the outer modal as soon as the tier card is
          expanded — not just when the Members step is opened. Hidden
          visually until the user enters the step. */}
      {showMemberPricing && t.id && (
        <div className="hidden">
          <MembersStep
            t={t}
            communityTag={communityTag}
            registerMemberPricingRef={registerMemberPricingRef}
            showToast={showToast}
          />
        </div>
      )}

      <SectionCard
        title="Basics"
        description={`${t.name || "Unnamed"} · ${priceDisplay}${t.installmentEnabled ? " · Installment plan" : ""}`}
        action={
          <button
            type="button"
            onClick={() => setActiveStep("basics")}
            className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer"
          >
            Edit <ChevronRight className="w-3 h-3" />
          </button>
        }
        variant="default"
      />

      <SectionCard
        title="Options"
        description={
          [
            t.capacity ? `Cap: ${t.capacity}` : "No capacity cap",
            t.priceMode === "pwyw" ? "Pay-what-you-want" : null,
            t.installmentEnabled && t.installmentCount && t.installmentTotal
              ? `${t.installmentCount}× over ${t.installmentInterval || "1"} mo`
              : null,
          ].filter(Boolean).join(" · ") || "Defaults"
        }
        action={
          <button
            type="button"
            onClick={() => setActiveStep("options")}
            className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer"
          >
            Edit <ChevronRight className="w-3 h-3" />
          </button>
        }
        variant="default"
      />

      {showMemberPricing && (
        <SectionCard
          title="Member pricing"
          description={t.id ? "Per-segment discount overrides for this tier." : "Save tier first to configure overrides."}
          action={
            <button
              type="button"
              onClick={() => setActiveStep("members")}
              disabled={!t.id}
              className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 disabled:text-zinc-300 disabled:cursor-not-allowed cursor-pointer"
            >
              Edit <ChevronRight className="w-3 h-3" />
            </button>
          }
          variant="default"
        />
      )}

      <SectionCard
        title="Registration form"
        description={
          !t.id
            ? t.sourceTierId
              ? `Will copy from "${t.sourceTierName || "source"}" on save.`
              : "Save tier first to attach a form."
            : t.hasForm
              ? `${t.formFieldCount} field${t.formFieldCount !== 1 ? "s" : ""} linked.`
              : "No form yet."
        }
        action={
          <button
            type="button"
            onClick={() => setActiveStep("form")}
            disabled={!t.id}
            className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 disabled:text-zinc-300 disabled:cursor-not-allowed cursor-pointer"
          >
            Edit <ChevronRight className="w-3 h-3" />
          </button>
        }
        variant="default"
      />
    </div>
  );
}
