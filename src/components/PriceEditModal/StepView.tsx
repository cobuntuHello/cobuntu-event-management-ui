"use client";

import { useRef, useState } from "react";
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
import { Eyebrow, StepInput, Switch } from "./_primitives";
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
      {/* key: local limited/unlimited state must reset when the modal moves
          to a different tier, or tier B inherits tier A's mode. */}
      {step === "capacity" && <CapacityStep key={t.localId} t={t} onUpdate={onUpdate} />}
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


/**
 * Capacity, with an explicit Unlimited switch.
 *
 * The stored shape is unchanged: `capacity: ""` still means unlimited, which
 * is what every consumer already reads. What changed is that "unlimited" used
 * to be expressed only by a placeholder on an empty input — a member had to
 * infer that leaving a field blank was a choice rather than an omission.
 *
 * `limited` is local rather than derived from `t.capacity` on purpose. Derived
 * state would make the input vanish mid-edit the moment someone selects-all
 * and deletes to retype a number, since an empty value reads as unlimited.
 *
 * The switch is deliberately NOT disabled on a tier with sales. Removing a cap
 * is always safe, and setting one is safe because the input keeps its
 * `min={salesCount}` floor — so capacity can never land below what buyers
 * already hold.
 */
function CapacityStep({
  t,
  onUpdate,
}: {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
}) {
  const locked = isTierLocked(t);
  const floor = locked ? t.salesCount : 0;
  const [limited, setLimited] = useState(!!t.capacity);
  const inputRef = useRef<HTMLInputElement>(null);

  function toggleUnlimited(unlimited: boolean) {
    if (unlimited) {
      setLimited(false);
      onUpdate({ capacity: "" });
      return;
    }
    setLimited(true);
    // Seed at the already-sold floor so a locked tier never starts below it,
    // and so "limited" is never silently stored as unlimited.
    onUpdate({ capacity: String(Math.max(1, floor)) });
    // rAF: the input is not mounted until this render commits.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow help="Unlimited means there is no cap on how many can be sold. Turn it off to set a maximum.">
          Capacity
        </Eyebrow>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-zinc-500">Unlimited</span>
          <Switch
            checked={!limited}
            onChange={(next) => toggleUnlimited(next)}
            label="Unlimited capacity"
          />
        </div>
      </div>

      {limited && (
        <>
          <div className="mt-1">
            <StepInput
              ref={inputRef}
              type="number"
              min={floor}
              step="1"
              value={t.capacity}
              onChange={(e) => onUpdate({ capacity: e.target.value })}
              placeholder="Maximum"
            />
          </div>
          {locked && (
            <p className="text-[10px] text-zinc-400 mt-1">Min {t.salesCount} (already sold).</p>
          )}
        </>
      )}
    </div>
  );
}
