"use client";

import * as React from "react";
import { Eyebrow, Stepper } from "./_primitives";
import { useEventT } from "../../create-wizard/i18n";

/**
 * Event capacity (T-422, backend docs/features/event-capacity.md): the places
 * ALL of the event's tickets share, e.g. 26 chairs at a dinner sold as "wine
 * included" and "without wine". Lives on the Pricing tiers list under "Whole
 * listing", beside Donations, because it belongs to the event, not a ticket.
 *
 * Two limits, the way Luma and Eventbrite work: each ticket keeps its own
 * optional capacity; this is the room. A place needs room in both. Not set,
 * the event holds what its tickets add up to, which the hint spells out so
 * the host sees why they might want a number here.
 */
export interface EventCapacitySectionProps {
  /** The number as typed; "" = not set. */
  value: string;
  onChange: (next: string) => void;
  /** Places already taken across all tickets (the floor). */
  taken: number;
  /** The live tickets' own capacities (null = an unlimited ticket). */
  ticketCapacities: Array<number | null>;
}

export function EventCapacitySection({ value, onChange, taken, ticketCapacities }: EventCapacitySectionProps) {
  const tx = useEventT("eventsUi.manageUi.eventCapacitySection");
  const capacity = value.trim() === "" ? null : parseInt(value, 10);
  const set = capacity != null && Number.isFinite(capacity);
  const left = set ? Math.max(0, (capacity as number) - taken) : 0;

  const capped = ticketCapacities.length > 0 && ticketCapacities.every((c) => c != null);
  const total = capped ? (ticketCapacities as number[]).reduce((n, c) => n + c, 0) : null;

  let hint: string;
  if (set) hint = tx("hintSet");
  else if (total == null) hint = tx("hintNotSetUnlimited");
  else if (ticketCapacities.length > 1) hint = tx("hintNotSetSum", { total, parts: (ticketCapacities as number[]).join(" + ") });
  else hint = tx("hintNotSetTotal", { total });

  return (
    <div>
      <Eyebrow help={tx("help")}>{tx("label")}</Eyebrow>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Stepper
          value={value}
          onChange={onChange}
          placeholder={tx("notSet")}
          min={Math.max(1, taken)}
          ariaLabel={tx("label")}
        />
        {set && (
          <span className="text-[12px] font-medium text-zinc-700 tabular-nums" data-testid="event-capacity-status">
            {left === 0
              ? tx("statusFull", { taken, capacity: capacity as number })
              : tx("status", { taken, capacity: capacity as number, left })}
          </span>
        )}
      </div>
      <p className="text-[12px] text-zinc-500 mt-1.5 leading-relaxed">{hint}</p>
    </div>
  );
}
