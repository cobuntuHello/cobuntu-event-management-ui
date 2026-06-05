"use client";

import type { DraftTier } from "./types";
import type {
  MemberPricingRow,
  MemberPricingTierState,
} from "./member-pricing";
import { DetailsStep } from "./steps/DetailsStep";
import { BasicsStep } from "./steps/BasicsStep";
import { ConfigStep } from "./steps/ConfigStep";
import { FormStep } from "./steps/FormStep";
import type { StepId } from "./TierHubView";

export interface StepViewProps {
  t: DraftTier;
  step: StepId;
  communityTag: string;
  onUpdate: (patch: Partial<DraftTier>) => void;
  /** Community-only — gates the member-pricing block inside Pricing config. */
  showMemberPricing?: boolean;
  /** Forwarded to the member-pricing block inside the Pricing config step. */
  memberPricingState?: MemberPricingTierState;
  onMemberPricingRowChange?: (idx: number, patch: Partial<MemberPricingRow>) => void;
  showToast: (msg: string) => void;
}

/**
 * Level 3 (step takeover) of the redesigned PriceEditModal. Renders just
 * the step body — the title/subtitle/breadcrumb live in the single modal
 * header (PriceEditModal), so there's no duplicated heading here.
 *
 * Navigation lives at the outer modal footer (Back + Save).
 */
export function StepView({
  t,
  step,
  communityTag,
  onUpdate,
  showMemberPricing,
  memberPricingState,
  onMemberPricingRowChange,
  showToast,
}: StepViewProps) {
  return (
    <div>
      {step === "details" && <DetailsStep t={t} onUpdate={onUpdate} />}
      {step === "basics" && (
        <BasicsStep
          t={t}
          onUpdate={onUpdate}
          showMemberPricing={showMemberPricing}
          memberPricingState={memberPricingState}
          onMemberPricingRowChange={onMemberPricingRowChange}
          showToast={showToast}
        />
      )}
      {step === "config" && <ConfigStep t={t} onUpdate={onUpdate} />}
      {step === "form" && (
        <FormStep t={t} communityTag={communityTag} showToast={showToast} />
      )}
    </div>
  );
}
