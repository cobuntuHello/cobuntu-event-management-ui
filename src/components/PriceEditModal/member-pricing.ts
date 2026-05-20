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

export type MemberPricingMode = "FREE" | "PERCENT_OFF" | "FLAT_OFF" | "FIXED_PRICE";

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
 *  used to do on its own useEffect. */
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

/** Builds the upsert body the backend expects. Per-mode value
 *  conversion: FLAT_OFF / FIXED_PRICE expect smallest unit,
 *  PERCENT_OFF expects 1-100 (no conversion). */
export function buildUpsertBody(
  r: MemberPricingRow,
  currencyCode: string,
): Record<string, unknown> {
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
