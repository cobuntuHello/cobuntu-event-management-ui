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
import { Eyebrow, StepInput } from "./_primitives";
import { isTierLocked } from "./helpers";

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
  /** Create flow — the tier has no server id, so the form step edits draft state. */
  draftMode?: boolean;
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
  draftMode,
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
      {step === "capacity" && (
        <div>
          <Eyebrow help="The maximum number of units sold for this tier. Leave blank for unlimited.">
            Capacity (optional)
          </Eyebrow>
          <div className="mt-1">
            <StepInput
              type="number"
              min={isTierLocked(t) ? t.salesCount : 0}
              step="1"
              value={t.capacity}
              onChange={(e) => onUpdate({ capacity: e.target.value })}
              placeholder="Unlimited"
            />
          </div>
          {isTierLocked(t) && (
            <p className="text-[10px] text-zinc-400 mt-1">Min {t.salesCount} (already sold).</p>
          )}
        </div>
      )}
      {step === "config" && <ConfigStep t={t} onUpdate={onUpdate} />}
      {step === "form" && (
        <FormStep
          t={t}
          communityTag={communityTag}
          showToast={showToast}
          draftMode={draftMode}
          // Reuses the existing draft-patch channel rather than adding a
          // second one — the form is just another field on the tier.
          onDraftFormChange={(form) => onUpdate({ draftForm: form })}
        />
      )}
    </div>
  );
}
