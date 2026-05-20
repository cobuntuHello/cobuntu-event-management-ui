"use client";

import { ArrowLeft } from "lucide-react";
import type { DraftTier } from "./types";
import type {
  MemberPricingRow,
  MemberPricingTierState,
} from "./member-pricing";
import { BasicsStep } from "./steps/BasicsStep";
import { OptionsStep } from "./steps/OptionsStep";
import { MembersStep } from "./steps/MembersStep";
import { FormStep } from "./steps/FormStep";
import type { StepId } from "./TierHubView";

export interface StepViewProps {
  t: DraftTier;
  step: StepId;
  communityTag: string;
  onUpdate: (patch: Partial<DraftTier>) => void;
  /** Click Back arrow → modal returns to Level 2 (per-tier hub). */
  onBack: () => void;
  /** Forwarded to MembersStep so it can render the MemberPricingSection. */
  memberPricingState?: MemberPricingTierState;
  onMemberPricingRowChange?: (idx: number, patch: Partial<MemberPricingRow>) => void;
  showToast: (msg: string) => void;
}

const STEP_TITLES: Record<StepId, string> = {
  basics: "Basics",
  options: "Options",
  members: "Member pricing",
  form: "Registration form",
};

/**
 * Level 3 (step takeover) of the redesigned PriceEditModal. Renders
 * one step component for one tier, with a back-arrow header that
 * returns to the per-tier hub.
 *
 * The modal's Save button (modal footer) commits everything — this
 * view doesn't have its own commit button. Back arrow just navigates;
 * dirty state propagates up to the modal via the standard handlers.
 */
export function StepView({
  t,
  step,
  communityTag,
  onUpdate,
  onBack,
  memberPricingState,
  onMemberPricingRowChange,
  showToast,
}: StepViewProps) {
  return (
    <div>
      {/* Back-to-hub row */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 cursor-pointer mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to {t.name || "tier"}
      </button>

      <div className="mb-4">
        <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
          {t.name || "Tier"} · {STEP_TITLES[step]}
        </p>
        <h3 className="text-[15px] font-semibold text-zinc-900 mt-0.5">
          {STEP_TITLES[step]}
        </h3>
      </div>

      {step === "basics" && <BasicsStep t={t} onUpdate={onUpdate} />}
      {step === "options" && <OptionsStep t={t} onUpdate={onUpdate} />}
      {step === "members" && (
        <MembersStep
          t={t}
          memberPricingState={memberPricingState}
          onMemberPricingRowChange={onMemberPricingRowChange}
          showToast={showToast}
        />
      )}
      {step === "form" && (
        <FormStep t={t} communityTag={communityTag} showToast={showToast} />
      )}
    </div>
  );
}
