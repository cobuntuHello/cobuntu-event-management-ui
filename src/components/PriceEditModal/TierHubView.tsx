"use client";

import { ChevronRight, Lock } from "lucide-react";
import { SectionCard } from "@cobuntu/management-ui-shared";
import type { DraftTier } from "./types";
import { getSymbol, isTierLocked } from "./helpers";

export type StepId = "details" | "basics" | "capacity" | "config" | "form";

/** Step metadata — shared by the modal header (breadcrumb + title +
 *  subtitle) and the hub tiles so they never drift. */
export const STEP_TITLES: Record<StepId, string> = {
  details: "Details",
  basics: "Pricing configuration",
  capacity: "Capacity",
  config: "Sales window",
  form: "Registration form",
};

export const STEP_SUBTITLES: Record<StepId, string> = {
  details: "Name, description, and attendance capacity for this tier.",
  basics: "Price, billing, and member discounts.",
  capacity: "Cap how many of this tier can be sold. Leave blank for unlimited.",
  config: "Set the timeframe this tier is available for sale.",
  form: "Attach a form buyers complete when they register.",
};

export interface TierHubViewProps {
  t: DraftTier;
  /** Click a SectionCard → modal enters Level 3 (step view). */
  onEnterStep: (step: StepId) => void;
}

/**
 * Level 2 (per-tier hub takeover) of the redesigned PriceEditModal.
 *
 * A pure navigation menu of tiles — Details / Pricing configuration /
 * Config / Registration form — for one tier. Each tile is fully clickable
 * (whole row is the tap target) and enters Level 3 for editing. The hub itself
 * has NO editable fields and NO Save: identity (name + capacity) lives in
 * the Details step now, so the footer Save behaves consistently across
 * every level (it was previously a misleading inline "Save" next to the
 * name that actually committed the whole modal).
 *
 * Back / Delete / Duplicate / Published live in the outer modal footer.
 */
export function TierHubView({
  t,
  onEnterStep,
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

      {/* Section tiles. Details = name + capacity; Basics = price + pricing
          model + billing + schedule. Single column on mobile so each tile
          renders its description fully; two columns above sm: where the
          modal is wider. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SectionCard
          title="Details"
          description={t.capacity ? `Capacity ${t.capacity}` : "Name & capacity"}
          action={chevron}
          onClick={() => onEnterStep("details")}
          variant="default"
        />

        <SectionCard
          title="Pricing configuration"
          description={
            [
              priceDisplay,
              t.priceMode === "pwyw" ? "PWYW" : null,
              billingSummary,
            ].filter(Boolean).join(" · ")
          }
          action={chevron}
          onClick={() => onEnterStep("basics")}
          variant="default"
        />

        <SectionCard
          title="Config"
          description={t.autoScheduleEnabled ? "Auto-scheduled window" : "Always available"}
          action={chevron}
          onClick={() => onEnterStep("config")}
          variant="default"
        />

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
