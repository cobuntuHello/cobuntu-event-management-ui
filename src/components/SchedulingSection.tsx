"use client";

import { useId } from "react";
import type { DraftTier } from "./PriceEditModal/types";

/**
 * Presentational publish + auto-schedule editor for a single tier.
 *
 * Three toggles + two date inputs, progressively disclosed:
 *
 *   1. **Published** — flips `publishedAt` between an ISO timestamp
 *      (now, on toggle-on) and null. Drafted tiers never reach the
 *      public API (the BE filters them out).
 *
 *   2. **Auto-schedule sales window** — only shown when published.
 *      Toggling this on reveals two datetime inputs. The window is
 *      a hard rule at checkout: outside [start, end) the public API
 *      refuses 409 TIER_NOT_ON_SALE. Lets a host express "Lote 1
 *      until June 1, Lote 2 from June 2 to June 5, ..." without
 *      manually flipping prices at each cutover.
 *
 * State lives in PriceEditModal via DraftTier; this component is a
 * pure prop-driven render that calls `onChange` with a patch.
 *
 * Backed by feat/event-tier-publish-and-schedule — see
 * docs/features/event-tier-publish-and-schedule.md.
 */

export interface SchedulingSectionProps {
  draft: Pick<DraftTier, "publishedAt" | "autoScheduleEnabled" | "salesStartAt" | "salesEndAt">;
  onChange: (patch: Partial<Pick<DraftTier, "publishedAt" | "autoScheduleEnabled" | "salesStartAt" | "salesEndAt">>) => void;
}

export type TierScheduleState = "draft" | "scheduled" | "on-sale" | "closed-ended";

/** Client-side mirror of services/core/.../tierSchedule.ts. Kept here as
 *  a tiny function rather than a dep on a shared package because the
 *  inputs are normalised draft strings (already ISO or empty) — the
 *  bare comparison logic is 8 lines. */
export function deriveScheduleState(
  draft: Pick<DraftTier, "publishedAt" | "salesStartAt" | "salesEndAt">,
  now: Date,
): TierScheduleState {
  if (!draft.publishedAt) return "draft";
  const published = new Date(draft.publishedAt);
  if (published.getTime() > now.getTime()) return "scheduled";
  if (draft.salesStartAt && new Date(draft.salesStartAt).getTime() > now.getTime()) {
    return "scheduled";
  }
  if (draft.salesEndAt && new Date(draft.salesEndAt).getTime() <= now.getTime()) {
    return "closed-ended";
  }
  return "on-sale";
}

const CHIP_STYLES: Record<TierScheduleState, { label: string; classes: string }> = {
  "draft": { label: "Draft", classes: "bg-zinc-100 text-zinc-600" },
  "scheduled": { label: "Scheduled", classes: "bg-amber-100 text-amber-800" },
  "on-sale": { label: "On sale", classes: "bg-emerald-100 text-emerald-800" },
  "closed-ended": { label: "Closed", classes: "bg-zinc-100 text-zinc-500" },
};

/**
 * Convert an ISO 8601 timestamp into the value expected by
 * <input type="datetime-local"> (YYYY-MM-DDTHH:mm, no timezone).
 * Returns "" for empty / null input so the input renders empty.
 */
function toDatetimeLocal(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SchedulingSection({ draft, onChange }: SchedulingSectionProps) {
  const headingId = useId();
  const startId = useId();
  const endId = useId();
  const published = !!draft.publishedAt;
  const state = deriveScheduleState(draft, new Date());
  const chip = CHIP_STYLES[state];

  // Cross-field validation: end must be strictly after start when both set.
  const startMs = draft.salesStartAt ? new Date(draft.salesStartAt).getTime() : null;
  const endMs = draft.salesEndAt ? new Date(draft.salesEndAt).getTime() : null;
  const invalidWindow =
    draft.autoScheduleEnabled
    && startMs !== null
    && endMs !== null
    && Number.isFinite(startMs)
    && Number.isFinite(endMs)
    && endMs <= startMs;

  return (
    <div className="px-4 pt-3 pb-3 border-t border-zinc-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p id={headingId} className="text-[12px] font-medium text-zinc-700">Publish & schedule</p>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${chip.classes}`}>
            {chip.label}
          </span>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-zinc-700 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
            checked={published}
            onChange={(e) =>
              onChange({
                publishedAt: e.target.checked ? new Date().toISOString() : null,
                // Turning off "published" also disables auto-schedule and
                // clears its window — saves a step on the "I'm un-launching
                // this tier" path.
                ...(!e.target.checked && {
                  autoScheduleEnabled: false,
                  salesStartAt: "",
                  salesEndAt: "",
                }),
              })
            }
            aria-labelledby={headingId}
          />
          <span>Published</span>
        </label>
      </div>
      <p className="text-[11px] text-zinc-500 mt-1">
        {published
          ? "Customers see this tier on the public events page."
          : "Drafted — hidden from the public events page until you publish."}
      </p>

      {published && (
        <div className="mt-3">
          <label className="flex items-center gap-2 text-[12px] text-zinc-700 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
              checked={!!draft.autoScheduleEnabled}
              onChange={(e) =>
                onChange({
                  autoScheduleEnabled: e.target.checked,
                  // Turning auto-schedule off clears the window so a future
                  // re-enable starts fresh (and doesn't silently keep an
                  // out-of-date bound that would block sales).
                  ...(!e.target.checked && { salesStartAt: "", salesEndAt: "" }),
                })
              }
            />
            <span>Auto-schedule sales window</span>
          </label>
          <p className="text-[11px] text-zinc-500 mt-1">
            Sales open and close automatically based on the dates below. Useful for date-driven price ladders (Lote 1 → Lote 2 → Lote 3).
          </p>

          {draft.autoScheduleEnabled && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={startId} className="block text-[11px] text-zinc-600 mb-1">
                  Sales open
                </label>
                <input
                  id={startId}
                  type="datetime-local"
                  className="w-full text-[12px] px-2 py-1.5 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400"
                  value={toDatetimeLocal(draft.salesStartAt)}
                  onChange={(e) => onChange({ salesStartAt: e.target.value ? new Date(e.target.value).toISOString() : "" })}
                />
              </div>
              <div>
                <label htmlFor={endId} className="block text-[11px] text-zinc-600 mb-1">
                  Sales close
                </label>
                <input
                  id={endId}
                  type="datetime-local"
                  className="w-full text-[12px] px-2 py-1.5 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400"
                  value={toDatetimeLocal(draft.salesEndAt)}
                  onChange={(e) => onChange({ salesEndAt: e.target.value ? new Date(e.target.value).toISOString() : "" })}
                />
              </div>
              {invalidWindow && (
                <p className="col-span-2 text-[11px] text-red-600">
                  Sales close must be after sales open.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
