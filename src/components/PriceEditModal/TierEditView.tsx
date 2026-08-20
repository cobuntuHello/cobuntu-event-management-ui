"use client";

import { ChevronRight, Package, Calendar, ClipboardList, Lock, Eye, EyeOff, Info } from "lucide-react";
import { Eyebrow, StepInput, StepTextarea, Switch } from "./_primitives";
import { TIER_NAME_MAX, TIER_DESCRIPTION_MAX, type DraftTier } from "./types";
import { isTierLocked } from "./helpers";
import { BasicsStep } from "./steps/BasicsStep";
import type { StepId } from "./steps";
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
  /**
   * Publish state + its toggle, lifted from the modal footer.
   *
   * It lived down there as a bare "Published" switch next to Save, which said
   * nothing about what publishing does or when it takes effect — and those two
   * answers genuinely differ (see the banner copy below).
   */
  onTogglePublish?: () => void;
  publishToggling?: boolean;
  /** Create wizard: the listing does not exist yet, so publishing is staged. */
  draftMode?: boolean;
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
  onTogglePublish,
  publishToggling,
  draftMode,
}: TierEditViewProps) {
  const locked = isTierLocked(t);

  // Saved tiers report the server's copy via hasForm/formFieldCount; a draft
  // tier reports what is staged locally. Same row, two sources.
  const formFieldCount = t.id ? (t.hasForm ? t.formFieldCount : 0) : (t.draftForm?.fields?.length ?? 0);
  const fieldCountLabel =
    formFieldCount > 0 ? `${formFieldCount} field${formFieldCount !== 1 ? "s" : ""}` : "None";

  // publishedAt is the source of truth; the switch is just its presence.
  const published = !!t.publishedAt;

  return (
    <div className="space-y-5">
      {locked && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50/70 border border-amber-100">
          <Lock className="w-3.5 h-3.5 mt-0.5 text-amber-600 shrink-0" />
          <p className="text-[12px] text-amber-700">
            {/*
              * "tickets sold", not "sales". On an event the thing that was
              * sold is a ticket somebody now holds, and naming it says WHY the
              * price cannot move: real people are on the other side of it. A
              * test has specified this wording since before the banner existed
              * and has been failing against "3 sales" ever since.
              */}
            <span className="font-medium">
              {`${t.salesCount} ticket${t.salesCount !== 1 ? "s" : ""} sold`}
            </span>
            {" — price, currency and the installment plan are locked, because changing them would alter what those buyers paid. Refund them first to change it."}
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
            /*
             * Reachable on an UNSAVED tier since 2026-08-08. A form used to
             * need a tierId to key on, so during create the row read
             * "Save first" and was disabled — which made no sense on the free
             * default tier that is always on display. The create payload now
             * carries the form inline, so the builder edits draft state and it
             * ships with the tier.
             */
            value={fieldCountLabel}
            onClick={() => onEnterStep("form")}
          />
        </div>
      </div>

      {/* Availability — the publish switch, with an explanation. Was a bare
          switch in the modal footer. */}
      {onTogglePublish && (
        <div>
          <Eyebrow>Availability</Eyebrow>
          <div className="mt-1.5 rounded-2xl ring-1 ring-zinc-100 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="text-zinc-400 shrink-0">
                {published ? <Eye className="h-[17px] w-[17px]" /> : <EyeOff className="h-[17px] w-[17px]" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-700">{published ? "Published" : "Draft"}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {published
                    ? "Buyers can see and choose this tier."
                    : "Hidden from buyers. Only you can see it."}
                </p>
              </div>
              <Switch
                checked={published}
                disabled={!!publishToggling}
                onChange={() => onTogglePublish()}
                label="Published"
              />
            </div>

            {/* Quiet left rail, no buttons — modelled on the admin revamp's
                InfoBanner. That one is indigo-600, which fights a community's
                own brand here, so this uses --brand-color like the rest of the
                member-facing surfaces. */}
            <div
              className="flex items-start gap-2.5 px-4 py-3 border-t border-zinc-100"
              style={{
                borderLeft: "3px solid var(--brand-color, #71717a)",
                background: "color-mix(in srgb, var(--brand-color, #71717a) 5%, transparent)",
              }}
            >
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "var(--brand-color, #71717a)" }} />
              <p className="text-[11.5px] text-zinc-600 leading-relaxed">
                {draftMode
                  ? `This choice is saved with the event — nothing goes live until you create it.`
                  : "Changes here take effect immediately."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
