"use client";

import { MemberPricingSection } from "../../MemberPricingSection";
import type { DraftTier } from "../types";
import { getSymbol } from "../helpers";
import type { MemberPricingRow, MemberPricingTierState } from "../member-pricing";

export interface MembersStepProps {
  t: DraftTier;
  /** Per-tier slot from the modal-level state map. Undefined when the
   *  tier hasn't been saved yet (no id) or showMemberPricing is off
   *  upstream. */
  memberPricingState?: MemberPricingTierState;
  /** Notify the modal of a member-pricing row change. */
  onMemberPricingRowChange?: (idx: number, patch: Partial<MemberPricingRow>) => void;
  showToast: (msg: string) => void;
  /**
   * Create flow. In draftMode the tier has no server id yet, but the backend
   * accepts member pricing inline on create, so the rows ARE editable here
   * (keyed by localId, folded into the create payload on Save). The
   * "Save tier first" placeholder is therefore only shown OUTSIDE draftMode.
   */
  draftMode?: boolean;
}

/**
 * "Members" step — community-only per-segment discount overrides for
 * this tier. Renders the presentational MemberPricingSection driven by
 * the modal-level state map (lifted out of the section itself so dirty
 * rows survive tier collapse / step navigation / any unmount).
 *
 * On the MANAGE page an unsaved tier (no `t.id`) skips the section —
 * backend keys overrides by tier id, so there's nothing to load until the
 * tier is created. In the CREATE wizard (draftMode) the rows are editable
 * anyway and ride the create payload; there `memberPricingState` is seeded
 * locally from the draft (keyed by localId).
 */
export function MembersStep({
  t,
  memberPricingState,
  onMemberPricingRowChange,
  draftMode,
}: MembersStepProps) {
  const sym = getSymbol(t.currency);
  const tierId = t.id;

  // "Save tier first" only outside draftMode: on the manage page an unsaved
  // tier has no id to attach overrides to. In draftMode the tier also has no
  // id, but the create payload carries member pricing inline, so we fall
  // through to the editable rows.
  if (!tierId && !draftMode) {
    return (
      <div className="px-4 py-6 rounded-lg border border-dashed border-zinc-300 text-center">
        <p className="text-[12px] font-medium text-zinc-700">Save tier first</p>
        <p className="text-[11px] text-zinc-500 mt-1">
          Member-pricing overrides need a saved tier id. Save once, then come back here.
        </p>
      </div>
    );
  }

  // Segments still loading (draftMode seeds rows once the community segments
  // fetch resolves), or the community has none — nothing to render yet.
  if (!memberPricingState) return null;

  return (
    <MemberPricingSection
      state={memberPricingState}
      onRowChange={(idx, patch) => onMemberPricingRowChange?.(idx, patch)}
      currencySymbol={sym}
    />
  );
}
