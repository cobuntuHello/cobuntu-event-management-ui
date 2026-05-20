"use client";

import { useCallback } from "react";
import {
  MemberPricingSection,
  type MemberPricingSectionHandle,
} from "../../MemberPricingSection";
import type { DraftTier } from "../types";
import { getSymbol } from "../helpers";

export interface MembersStepProps {
  t: DraftTier;
  communityTag: string;
  /** Imperative ref registration — the outer modal's Save loop calls
   *  commit() on each mounted section. */
  registerMemberPricingRef?: (tierId: string, handle: MemberPricingSectionHandle | null) => void;
  showToast: (msg: string) => void;
}

/**
 * "Members" step — community-only per-segment discount overrides for
 * this tier. Wraps the existing MemberPricingSection so the imperative
 * ref API stays intact; the parent modal still commits overrides
 * under its single Save button.
 *
 * Unsaved tiers (no `t.id`) can't carry overrides yet — the backend
 * needs a real tier id. The step renders a hint instead of mounting
 * an empty section.
 */
export function MembersStep({
  t,
  communityTag,
  registerMemberPricingRef,
  showToast,
}: MembersStepProps) {
  const sym = getSymbol(t.currency);
  const tierId = t.id;

  // Stable ref-callback so React doesn't unregister+reregister the
  // handle on every parent render. The outer modal's Save loop relies
  // on the ref staying attached to detect dirty rows. Closes over the
  // tier id captured at this render — when the tier id changes (rare;
  // happens only after a brand-new tier is saved and re-fetched), the
  // callback identity changes and React swaps the registration.
  const refCallback = useCallback(
    (handle: MemberPricingSectionHandle | null) => {
      if (tierId) registerMemberPricingRef?.(tierId, handle);
    },
    [registerMemberPricingRef, tierId],
  );

  if (!tierId) {
    return (
      <div className="px-4 py-6 rounded-lg border border-dashed border-zinc-300 text-center">
        <p className="text-[12px] font-medium text-zinc-700">Save tier first</p>
        <p className="text-[11px] text-zinc-500 mt-1">
          Member-pricing overrides need a saved tier id. Save once, then come back here.
        </p>
      </div>
    );
  }

  return (
    <MemberPricingSection
      ref={refCallback}
      communityTag={communityTag}
      tierId={tierId}
      currencyCode={t.currency}
      currencySymbol={sym}
      showToast={showToast}
    />
  );
}
