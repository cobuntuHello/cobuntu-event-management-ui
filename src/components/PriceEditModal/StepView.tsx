"use client";

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
 * one step component for one tier with a context eyebrow.
 *
 * Navigation lives at the outer modal footer (Back + Save), not in
 * this view — keeps the action surface predictable across L1/L2/L3.
 */
export function StepView({
  t,
  step,
  communityTag,
  onUpdate,
  memberPricingState,
  onMemberPricingRowChange,
  showToast,
}: StepViewProps) {
  return (
    <div>
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
