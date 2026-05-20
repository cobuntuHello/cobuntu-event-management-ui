"use client";

import { ArrowLeft, ChevronRight, Lock, Trash2, Copy } from "lucide-react";
import { SectionCard } from "@cobuntu/management-ui-shared";
import type { DraftTier } from "./types";
import { getSymbol, isTierLocked } from "./helpers";
import { StepInput } from "./_primitives";

export type StepId = "basics" | "options" | "members" | "form";

export interface TierHubViewProps {
  t: DraftTier;
  /** Community-only — admin sets true, community-app /manage omits. */
  showMemberPricing: boolean;
  /** Whether the tier has been duplicated and whether the parent
   *  supports the duplicate action at this level. */
  canDuplicate: boolean;
  /** Whether deletion is allowed (false when this is the only tier). */
  canDelete: boolean;
  onUpdate: (patch: Partial<DraftTier>) => void;
  /** Click "Edit" on a SectionCard → modal enters Level 3 (step view). */
  onEnterStep: (step: StepId) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Click "Back to tiers" → modal returns to Level 1 (tier list). */
  onBack: () => void;
}

/**
 * Level 2 (per-tier hub takeover) of the redesigned PriceEditModal.
 *
 * Renders the four section-card landing (Basics / Options / Members /
 * Form) for a single tier. Takes over the modal body entirely — no
 * siblings, no Add Tier button, no Donations section visible while
 * the user is on this view. The modal's Save button (at the modal
 * footer) commits everything across all tiers when the user is ready.
 *
 * Tier name + duplicate + delete live in the header here, not in the
 * Level 1 row. Forces a deliberate "select tier → edit" navigation
 * that matches the user's mental model of stepping INTO a tier.
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
  canDuplicate,
  canDelete,
  onUpdate,
  onEnterStep,
  onDuplicate,
  onRemove,
  onBack,
}: TierHubViewProps) {
  const sym = getSymbol(t.currency);
  const locked = isTierLocked(t);
  const priceDisplay = t.price && parseFloat(t.price) > 0 ? `${sym}${t.price}` : "Free";

  const billingSummary = t.installmentEnabled ? "Installment plan" : null;

  return (
    <div>
      {/* Back-to-tiers row */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 cursor-pointer mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to tiers
      </button>

      {/* Tier name + actions header */}
      <div className="space-y-3 mb-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">
              Tier name
            </label>
            <StepInput
              type="text"
              value={t.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="Standard, VIP, Early-bird…"
            />
          </div>
          {canDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              className="h-[38px] px-3 text-[12px] font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer inline-flex items-center gap-1.5 shrink-0"
              title="Duplicate tier"
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onRemove}
              disabled={locked}
              className="h-[38px] px-3 text-[12px] font-medium text-red-600 bg-white border border-red-100 rounded-lg hover:bg-red-50 cursor-pointer inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              title={locked ? "Refund sales before deleting" : "Delete tier"}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
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

      <div className="space-y-2">
        <SectionCard
          title="Basics"
          description={`${priceDisplay}${billingSummary ? ` · ${billingSummary}` : ""}`}
          action={
            <button
              type="button"
              onClick={() => onEnterStep("basics")}
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
              onClick={() => onEnterStep("options")}
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
                onClick={() => onEnterStep("members")}
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
              onClick={() => onEnterStep("form")}
              disabled={!t.id}
              className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 disabled:text-zinc-300 disabled:cursor-not-allowed cursor-pointer"
            >
              Edit <ChevronRight className="w-3 h-3" />
            </button>
          }
          variant="default"
        />
      </div>
    </div>
  );
}
