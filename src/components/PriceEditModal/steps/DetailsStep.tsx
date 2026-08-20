"use client";

import { TIER_NAME_MAX, TIER_DESCRIPTION_MAX, type DraftTier } from "../types";
import { isTierLocked } from "../helpers";
import { Eyebrow, StepInput, StepTextarea } from "../_primitives";

export interface DetailsStepProps {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
}

/**
 * "Details" step — the tier's identity fields: name + description +
 * capacity. Split out
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
        <Eyebrow
          help="The public label buyers see at checkout, e.g. “Early bird” or “VIP”."
          count={t.name.length}
          max={TIER_NAME_MAX}
        >
          Tier name
        </Eyebrow>
        <div className="mt-1">
          <StepInput
            type="text"
            value={t.name}
            maxLength={TIER_NAME_MAX}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Standard, VIP, Early-bird…"
          />
        </div>
      </div>

      {/* Description — tier info, lives with the identity fields. */}
      <div>
        <Eyebrow
          help="Shown on the public ticket card — a short note on what this tier includes."
          count={t.description.length}
          max={TIER_DESCRIPTION_MAX}
        >
          Description (optional)
        </Eyebrow>
        <div className="mt-1">
          <StepTextarea
            value={t.description}
            maxLength={TIER_DESCRIPTION_MAX}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="What's included"
            rows={3}
          />
        </div>
      </div>

      {/* Capacity (attendance cap) — raisable even on a locked tier; just
          can't drop below sold. */}
      <div>
        <Eyebrow help="The maximum number of tickets sold for this tier. Leave blank for unlimited.">
          Capacity (optional)
        </Eyebrow>
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
        {/*
          * Says WHY the floor exists, not just what it is. "Min 3" reads as an
          * arbitrary rule; "3 already have tickets" is a fact the host can act
          * on -- and it makes clear the cap can still be RAISED, which the
          * bare number did not.
          */}
        {locked && (
          <p className="mt-1 text-[10.5px] text-zinc-500">
            {t.salesCount === 1
              ? "1 person already has a ticket, so the cap cannot go below 1. You can still raise it."
              : `${t.salesCount} people already have tickets, so the cap cannot go below ${t.salesCount}. You can still raise it.`}
          </p>
        )}
      </div>
    </div>
  );
}
