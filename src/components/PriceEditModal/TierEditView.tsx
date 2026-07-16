"use client";

import { ChevronRight, Package, Calendar, ClipboardList, Lock } from "lucide-react";
import { Eyebrow, StepInput, StepTextarea } from "./_primitives";
import { TIER_NAME_MAX, TIER_DESCRIPTION_MAX, type DraftTier } from "./types";
import { isTierLocked } from "./helpers";
import { BasicsStep } from "./steps/BasicsStep";
import type { StepId } from "./TierHubView";
import type { MemberPricingRow, MemberPricingTierState } from "./member-pricing";

export interface TierEditViewProps {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
  /** Drill into an Advanced sub-screen (Level 3). */
  onEnterStep: (step: StepId) => void;
  showMemberPricing?: boolean;
  memberPricingState?: MemberPricingTierState;
  onMemberPricingRowChange?: (idx: number, patch: Partial<MemberPricingRow>) => void;
  showToast?: (msg: string) => void;
}

/** A settings row in the Advanced group — opens a sub-screen (Level 3). */
function AdvancedRow({
  icon, label, value, onClick, disabled,
}: { icon: React.ReactNode; label: string; value: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-zinc-50/60 cursor-pointer"}`}
    >
      <span className="text-zinc-400 shrink-0">{icon}</span>
      <span className="text-sm flex-1 text-zinc-700">{label}</span>
      <span className="text-[13px] text-zinc-400">{value}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
    </button>
  );
}

/**
 * Level 2 of the redesigned PriceEditModal — a per-tier EDIT screen (not the
 * old tile menu). Name, description, and the full pricing surface sit inline;
 * everything else (capacity, sales window, registration form) drills into an
 * Advanced sub-screen (Level 3) with the modal's cross-fade. The tier LIST now
 * lives in the form, so this screen is reached by tapping a tier / "Add tier".
 */
export function TierEditView({
  t,
  onUpdate,
  onEnterStep,
  showMemberPricing,
  memberPricingState,
  onMemberPricingRowChange,
  showToast,
}: TierEditViewProps) {
  const locked = isTierLocked(t);

  return (
    <div className="space-y-5">
      {locked && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50/70 border border-amber-100">
          <Lock className="w-3.5 h-3.5 mt-0.5 text-amber-600 shrink-0" />
          <p className="text-[12px] text-amber-700">
            <span className="font-medium">{`${t.salesCount} sale${t.salesCount !== 1 ? "s" : ""}`}</span>
            {" — price, currency, and installment plan are locked. Refund all sales first to change them."}
          </p>
        </div>
      )}

      {/* Identity — name + description, inline, with live char counters. */}
      <div>
        <Eyebrow count={t.name.length} max={TIER_NAME_MAX}
          help="The public label buyers see at checkout, e.g. “Early bird” or “VIP”.">
          Tier name
        </Eyebrow>
        <div className="mt-1">
          <StepInput type="text" value={t.name} maxLength={TIER_NAME_MAX}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Standard, VIP, Early-bird…" />
        </div>
      </div>

      <div>
        <Eyebrow count={t.description.length} max={TIER_DESCRIPTION_MAX}
          help="Shown on the public product card — a short note on what this tier includes.">
          Description (optional)
        </Eyebrow>
        <div className="mt-1">
          <StepTextarea value={t.description} maxLength={TIER_DESCRIPTION_MAX}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="What's included" rows={2} />
        </div>
      </div>

      {/* Pricing — the full pricing surface, inline (model, price, billing,
          installment schedule, and member pricing when enabled). */}
      <div>
        <Eyebrow>Pricing</Eyebrow>
        <div className="mt-2">
          <BasicsStep
            t={t}
            onUpdate={onUpdate}
            showMemberPricing={showMemberPricing}
            memberPricingState={memberPricingState}
            onMemberPricingRowChange={onMemberPricingRowChange}
            showToast={showToast}
          />
        </div>
      </div>

      {/* Advanced — one hairline-divided card of rows that drill into a
          sub-screen. Matches the approved mockup. */}
      <div>
        <Eyebrow>Advanced</Eyebrow>
        <div className="mt-1.5 rounded-2xl ring-1 ring-zinc-100 divide-y divide-zinc-100 overflow-hidden">
          <AdvancedRow
            icon={<Package className="h-[17px] w-[17px]" />}
            label="Capacity"
            value={t.capacity ? `${t.capacity} spots` : "Unlimited"}
            onClick={() => onEnterStep("capacity")}
          />
          <AdvancedRow
            icon={<Calendar className="h-[17px] w-[17px]" />}
            label="Sales window"
            value={t.autoScheduleEnabled ? "Scheduled" : "Always on"}
            onClick={() => onEnterStep("config")}
          />
          <AdvancedRow
            icon={<ClipboardList className="h-[17px] w-[17px]" />}
            label="Registration form"
            value={!t.id ? "Save first" : t.hasForm ? `${t.formFieldCount} field${t.formFieldCount !== 1 ? "s" : ""}` : "None"}
            onClick={() => onEnterStep("form")}
            disabled={!t.id}
          />
        </div>
      </div>
    </div>
  );
}
