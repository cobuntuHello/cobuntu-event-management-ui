"use client";

import type { DraftTier } from "./PriceEditModal/types";
import { DateTimePicker } from "./PriceEditModal/_datetime-picker";
import { Switch } from "./PriceEditModal/_primitives";
import { useEventT } from "../create-wizard/i18n";

/**
 * Auto-schedule sales-window editor for a single tier (lives in the
 * OptionsStep).
 *
 * NOTE: the **publish** toggle used to live here too, but it moved to the
 * tier-hub (Level 2) footer as an instant on/off Switch — publishing is a
 * top-level rollout action, not a setting buried inside Options. This
 * component now owns only the optional auto-schedule window:
 *
 *   - **Auto-schedule sales window** — a Switch; when on, two custom
 *     date-time pickers set [salesStartAt, salesEndAt). The window is
 *     enforced server-side at checkout (409 TIER_NOT_ON_SALE outside it).
 *     Lets a host express "Batch 1 until June 1, Batch 2 June 2–5, ..."
 *     without manually flipping prices at each cutover.
 *
 * State lives in PriceEditModal via DraftTier; this is a pure prop-driven
 * render that calls `onChange` with a patch.
 */

export interface SchedulingSectionProps {
  draft: Pick<DraftTier, "publishedAt" | "autoScheduleEnabled" | "salesStartAt" | "salesEndAt">;
  onChange: (patch: Partial<Pick<DraftTier, "autoScheduleEnabled" | "salesStartAt" | "salesEndAt">>) => void;
}

export type TierScheduleState = "draft" | "scheduled" | "on-sale" | "closed-ended";

/** Client-side mirror of services/core/.../tierSchedule.ts. Kept here as
 *  a tiny function rather than a dep on a shared package because the
 *  inputs are normalised draft strings (already ISO or empty) — the
 *  bare comparison logic is 8 lines. Still exported for the tier-hub
 *  footer's status chip + ad-hoc consumers. */
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

export function SchedulingSection({ draft, onChange }: SchedulingSectionProps) {
  const t = useEventT("eventsUi.manageUi.schedulingSection");
  const published = !!draft.publishedAt;

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
  // Enabled with neither bound is a no-op window — save is blocked
  // (validateTier), so flag it inline too.
  const noDates = draft.autoScheduleEnabled && !draft.salesStartAt && !draft.salesEndAt;

  return (
    <div className="pt-3 border-t border-zinc-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-zinc-700">{t("autoSchedule")}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {t("autoScheduleHint")}
          </p>
        </div>
        <Switch
          checked={!!draft.autoScheduleEnabled}
          onChange={(next) =>
            onChange({
              autoScheduleEnabled: next,
              // Turning auto-schedule off clears the window so a future
              // re-enable starts fresh (and doesn't silently keep an
              // out-of-date bound that would block sales).
              ...(!next && { salesStartAt: "", salesEndAt: "" }),
            })
          }
          label={t("autoSchedule")}
        />
      </div>

      {draft.autoScheduleEnabled && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-zinc-600 mb-1">{t("salesOpen")}</p>
            <DateTimePicker
              value={draft.salesStartAt}
              onChange={(iso) => onChange({ salesStartAt: iso })}
              ariaLabel={t("salesOpen")}
              placeholder={t("opensOnPublish")}
            />
          </div>
          <div>
            <p className="text-[11px] text-zinc-600 mb-1">{t("salesClose")}</p>
            <DateTimePicker
              value={draft.salesEndAt}
              onChange={(iso) => onChange({ salesEndAt: iso })}
              ariaLabel={t("salesClose")}
              placeholder={t("openEnded")}
            />
          </div>
          {invalidWindow && (
            <p className="col-span-2 text-[11px] text-red-600">
              {t("closeAfterOpen")}
            </p>
          )}
          {noDates && (
            <p className="col-span-2 text-[11px] text-amber-600">
              {t("noDates")}
            </p>
          )}
          {!published && (
            <p className="col-span-2 text-[11px] text-amber-600">
              {t("takesEffectOnPublish")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
