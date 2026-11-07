/**
 * Member-pricing data layer for the PriceEditModal redesign.
 *
 * Lifts the row state + API integration out of MemberPricingSection
 * (which used to own them via useState + useImperativeHandle) up to
 * PriceEditModal. The section becomes presentational; this module is
 * the controller.
 *
 * Why: the section's lifetime tracked the tier card's expand/collapse
 * state (it was rendered inside <Collapse>), so collapsing a tier
 * unmounted the section and dropped any dirty rows. The user thought
 * they had saved; nothing did. Lifting the state up means the rows
 * survive collapse/expand cycles and across hub↔step transitions —
 * tied to the modal's lifetime instead.
 */

import { fromSmallestUnit, toSmallestUnit } from "./helpers";
import type { DraftTier } from "./types";
import { vatOnNetMinor } from "./vat";

export type MemberPricingMode = "FREE" | "PERCENT_OFF" | "FLAT_OFF" | "FIXED_PRICE";

/**
 * The backend member-pricing payload object — one per (tier, segment)
 * override. This is exactly what buildUpsertBody emits and what the
 * create-event endpoint now accepts inline on a tier's `memberPricing[]`
 * array (created atomically with the tier). Money (FLAT_OFF / FIXED_PRICE
 * `value`) is in the currency's smallest unit; PERCENT_OFF `value` is
 * 1-100; FREE ignores `value`. Events are not recurring, so there is no
 * recurringScope here (mirrors buildUpsertBody / the manage path).
 */
export interface MemberPricingUpsert {
  segmentId: string;
  mode: MemberPricingMode;
  value?: number;
  priority?: number;
}

export interface CommunitySegment {
  id: string;
  name: string;
  color?: string | null;
}

export interface MemberPricingRow {
  /** Override row id, present only once the buyer has saved at least
   *  one override for this (tier, segment). */
  id?: string;
  segmentId: string;
  segmentName: string;
  enabled: boolean;
  mode: MemberPricingMode;
  /** Display string. Mode-dependent: FREE ignores it, PERCENT_OFF is
   *  1–100, FLAT_OFF / FIXED_PRICE are display-unit (e.g. "10" = €10). */
  value: string;
  priority: string;
  /** Snapshot of the row's persisted shape so isDirty can tell whether
   *  the user changed something since the last successful commit. */
  initial?: {
    enabled: boolean;
    mode: MemberPricingMode;
    value: string;
    priority: string;
    id?: string;
  };
}

/** Per-tier slot in the modal-level state map. */
export type MemberPricingTierState =
  | { loading: true; error: null; rows: never[] }
  | { loading: false; error: string; rows: never[] }
  | { loading: false; error: null; rows: MemberPricingRow[] };

/** Builds the initial row set from the segments list + any existing
 *  overrides fetched from the backend. Mirrors what MemberPricingSection
 *  used to do on its own useEffect. Amounts are before VAT, like every price,
 *  so they are shown back exactly as stored. */
export function buildRowsFromOverrides(
  segments: CommunitySegment[],
  overrides: Array<Record<string, any>>,
  currencyCode: string,
): MemberPricingRow[] {
  const byId = new Map<string, any>(overrides.map((o) => [o.segmentId, o]));
  return segments.map((s) => {
    const o = byId.get(s.id);
    const valueRaw: string = o
      ? o.mode === "FLAT_OFF" || o.mode === "FIXED_PRICE"
        ? fromSmallestUnit(o.value, currencyCode)
        : String(o.value ?? "")
      : "";
    const initial = {
      enabled: !!o,
      mode: (o?.mode as MemberPricingMode) ?? "PERCENT_OFF",
      value: valueRaw,
      priority: String(o?.priority ?? "0"),
      id: o?.id,
    };
    return {
      id: o?.id,
      segmentId: s.id,
      segmentName: s.name,
      enabled: initial.enabled,
      mode: initial.mode,
      value: initial.value,
      priority: initial.priority,
      initial,
    };
  });
}

export function rowIsDirty(r: MemberPricingRow): boolean {
  if (!r.initial) return r.enabled;
  return (
    r.enabled !== r.initial.enabled ||
    r.mode !== r.initial.mode ||
    r.value.trim() !== r.initial.value.trim() ||
    r.priority.trim() !== r.initial.priority.trim()
  );
}

/** Returns the first validation error encountered across the rows, or
 *  null when everything is valid. Stops the save loop early on failure. */
export function findFirstValidationError(rows: MemberPricingRow[]): string | null {
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.mode === "FREE") continue;
    const v = parseFloat(r.value);
    if (isNaN(v) || v < 0) {
      return `${r.segmentName}: value must be a non-negative number.`;
    }
    if (r.mode === "PERCENT_OFF" && (v < 1 || v > 100)) {
      return `${r.segmentName}: percent off must be between 1 and 100.`;
    }
  }
  return null;
}

/** Resets the local `initial` baseline after a successful commit so
 *  isDirty starts returning false again. Called by the modal's save
 *  loop once the network round-trips succeed. */
export function resetRowsBaseline(rows: MemberPricingRow[]): MemberPricingRow[] {
  return rows.map((r) => ({
    ...r,
    initial: {
      enabled: r.enabled,
      mode: r.mode,
      value: r.value,
      priority: r.priority,
      id: r.id ?? r.initial?.id,
    },
  }));
}

/**
 * What a member pays at checkout for this row, or null when there is nothing
 * certain to show: no VAT on the ticket, a buyer-chosen price, or an amount not
 * typed yet. The discount is taken off the price before VAT, as the backend's
 * applyOverrideToPrice does, and checkout then adds the VAT.
 */
export function memberPricePreview(
  r: MemberPricingRow,
  t: DraftTier,
  rate: number | null,
): { gross: number; net: number; vat: number } | null {
  if (!r.enabled || rate == null || !(rate > 0) || t.priceMode === "pwyw") return null;
  const typedList = parseFloat(t.price);
  if (!Number.isFinite(typedList)) return null;
  const list = toSmallestUnit(typedList, t.currency);

  let net: number;
  if (r.mode === "FREE") {
    net = 0;
  } else if (r.mode === "PERCENT_OFF") {
    const percent = parseInt(r.value, 10);
    if (!Number.isFinite(percent)) return null;
    net = Math.floor((list * (100 - percent)) / 100);
  } else {
    const typed = parseFloat(r.value);
    if (!Number.isFinite(typed)) return null;
    const amount = toSmallestUnit(typed, t.currency);
    net = r.mode === "FLAT_OFF" ? Math.max(0, list - amount) : amount;
  }
  const vat = vatOnNetMinor(net, rate);
  return { gross: net + vat, net, vat };
}

/** Builds the upsert body the backend expects. Per-mode value
 *  conversion: FLAT_OFF / FIXED_PRICE expect smallest unit,
 *  PERCENT_OFF expects 1-100 (no conversion). Amounts are before VAT. */
export function buildUpsertBody(
  r: MemberPricingRow,
  currencyCode: string,
): MemberPricingUpsert {
  let backendValue = 0;
  if (r.mode === "PERCENT_OFF") {
    backendValue = parseInt(r.value, 10);
  } else if (r.mode === "FLAT_OFF" || r.mode === "FIXED_PRICE") {
    backendValue = toSmallestUnit(parseFloat(r.value), currencyCode);
  }
  return {
    segmentId: r.segmentId,
    mode: r.mode,
    value: backendValue,
    priority: parseInt(r.priority || "0", 10) || 0,
  };
}
