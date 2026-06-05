"use client";

import type { DraftTier } from "../types";
import { SchedulingSection } from "../../SchedulingSection";

export interface ConfigStepProps {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
}

/**
 * "Config" step — availability rules for the tier, NOT price config.
 *
 * Currently owns the auto-schedule sales window: "during which timeframe
 * is this tier available for sale?". Split out of the Pricing
 * configuration step because a sales window is a fundamentally different
 * axis from price/billing/discounts — it answers WHEN the tier is on sale,
 * not HOW MUCH it costs. Keeping it separate keeps both steps focused and
 * leaves an obvious home for future availability rules (e.g. capacity
 * gating, member-only windows).
 */
export function ConfigStep({ t, onUpdate }: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <SchedulingSection
        draft={{
          publishedAt: t.publishedAt,
          autoScheduleEnabled: t.autoScheduleEnabled,
          salesStartAt: t.salesStartAt,
          salesEndAt: t.salesEndAt,
        }}
        onChange={(patch) => onUpdate(patch as Partial<DraftTier>)}
      />
    </div>
  );
}
