"use client";

import type { DraftTier } from "../types";
import { isTierLocked } from "../helpers";
import { Eyebrow, StepInput } from "../_primitives";

export interface DetailsStepProps {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
}

/**
 * "Details" step — the tier's identity fields: name + capacity. Split out
 * of the tier hub so the hub stays a pure navigation menu of tiles. The
 * old hub had the name input + an inline Save that read as "save the title"
 * when it actually committed the whole modal; routing the name (and the
 * attendance cap) through a normal step means the footer Save behaves the
 * same here as in every other step.
 */
export function DetailsStep({ t, onUpdate }: DetailsStepProps) {
  const locked = isTierLocked(t);

  return (
    <div className="space-y-4">
      {/* Tier name */}
      <div>
        <Eyebrow>Tier name</Eyebrow>
        <div className="mt-1">
          <StepInput
            type="text"
            value={t.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Standard, VIP, Early-bird…"
          />
        </div>
      </div>

      {/* Capacity (attendance cap) — raisable even on a locked tier; just
          can't drop below sold. */}
      <div>
        <Eyebrow>Capacity (optional)</Eyebrow>
        <div className="mt-1">
          <StepInput
            type="number"
            min={locked ? t.salesCount : 0}
            step="1"
            value={t.capacity}
            onChange={(e) => onUpdate({ capacity: e.target.value })}
            placeholder="Unlimited"
          />
        </div>
        {locked && (
          <p className="text-[10px] text-zinc-400 mt-1">Min {t.salesCount} (already sold).</p>
        )}
      </div>
    </div>
  );
}
