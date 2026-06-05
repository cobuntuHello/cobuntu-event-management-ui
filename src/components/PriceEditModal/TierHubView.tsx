"use client";

import { ChevronRight, Lock } from "lucide-react";
import { SectionCard } from "@cobuntu/management-ui-shared";
import type { DraftTier } from "./types";
import { getSymbol, isTierLocked } from "./helpers";
import { StepInput } from "./_primitives";

export type StepId = "basics" | "members" | "form";

export interface TierHubViewProps {
  t: DraftTier;
  /** Community-only — admin sets true, community-app /manage omits. */
  showMemberPricing: boolean;
  onUpdate: (patch: Partial<DraftTier>) => void;
  /** Click a SectionCard → modal enters Level 3 (step view). */
  onEnterStep: (step: StepId) => void;
  /** Persist the tier — wired to the inline Save beside the name input.
   *  This step's primary action is (re)naming the tier; the section
   *  cards open their own L3 editors. */
  onSave: () => void;
  saving?: boolean;
}

/**
 * Level 2 (per-tier hub takeover) of the redesigned PriceEditModal.
 *
 * Renders the four section-card landing (Basics / Options / Members /
 * Form) for a single tier. Each card is fully clickable (whole row is
 * the tap target — better mobile UX) and enters Level 3 for editing.
 *
 * Back / Duplicate / Delete / Save live in the outer modal footer
 * (PriceEditModal-level), not in the body — the footer-driven nav
 * pattern keeps the action surface predictable across L1/L2/L3.
 *
 * MembersStep + FormStep mount in Level 3 (StepView) when the user
 * enters those steps; their state is held at the modal level (via
 * the member-pricing.ts state map for Members, and re-fetch on entry
 * for Form). Neither is mounted here at the hub level — keeps the
 * DOM small while the user is scanning section summaries.
 */
export function TierHubView({
  t,
  showMemberPricing,
  onUpdate,
  onEnterStep,
  onSave,
  saving = false,
}: TierHubViewProps) {
  const sym = getSymbol(t.currency);
  const locked = isTierLocked(t);
  const priceDisplay = t.price && parseFloat(t.price) > 0 ? `${sym}${t.price}` : "Free";

  const billingSummary = t.installmentEnabled ? "Installment plan" : null;

  // Decorative chevron — the SectionCard itself is the click target.
  const chevron = (
    <span className="flex items-center text-zinc-400" aria-hidden>
      <ChevronRight className="w-4 h-4" />
    </span>
  );

  return (
    <div>
      {/* Tier name editor — Save sits inline because renaming the tier is
          this step's primary action (section cards open their own steps). */}
      <div className="mb-4">
        <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">
          Tier name
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <StepInput
              type="text"
              value={t.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="Standard, VIP, Early-bird…"
            />
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="shrink-0 px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {locked && (
        <div className="flex items-start gap-2 px-3 py-2 mb-3 rounded-lg bg-amber-50/70 border border-amber-100">
          <Lock className="w-3.5 h-3.5 mt-0.5 text-amber-600 shrink-0" />
          <p className="text-[12px] text-amber-700">
            <span className="font-medium">
              {`${t.salesCount} ticket${t.salesCount !== 1 ? "s" : ""} sold`}
            </span>
            {" — price, currency, and installment plan are locked. Refund all sales first to change them."}
          </p>
        </div>
      )}

      {/* Section cards. Basics now holds all price + capacity + schedule
          config (the old "Options" step was merged into it), so its card
          summarises the lot. */}
      <div className="grid grid-cols-2 gap-2">
        <SectionCard
          title="Basics"
          description={
            [
              priceDisplay,
              t.priceMode === "pwyw" ? "PWYW" : null,
              billingSummary,
              t.capacity ? `Cap ${t.capacity}` : null,
            ].filter(Boolean).join(" · ")
          }
          action={chevron}
          onClick={() => onEnterStep("basics")}
          variant="default"
        />

        {showMemberPricing && (
          <SectionCard
            title="Member pricing"
            description={t.id ? "Per-segment discount overrides for this tier." : "Save tier first to configure overrides."}
            action={chevron}
            onClick={() => onEnterStep("members")}
            disabled={!t.id}
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
          action={chevron}
          onClick={() => onEnterStep("form")}
          disabled={!t.id}
          variant="default"
        />
      </div>
    </div>
  );
}
