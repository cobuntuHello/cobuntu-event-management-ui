"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  rowIsDirty,
  type MemberPricingMode,
  type MemberPricingRow,
  type MemberPricingTierState,
} from "./PriceEditModal/member-pricing";

/**
 * Presentational member-pricing editor for a single (community-owned)
 * event tier.
 *
 * Renders one row per community segment, each with an enable toggle +
 * mode dropdown (FREE / PERCENT_OFF / FLAT_OFF / FIXED_PRICE) + value
 * + priority. recurringScope is omitted on the events surface (events
 * tiers are not recurring — Stripe mode='payment').
 *
 * **State model (slice-after-redesign):** all state — segments, rows,
 * dirty tracking, fetch + commit lifecycle — lives in PriceEditModal
 * via the helpers in ./PriceEditModal/member-pricing.ts. This component
 * is a pure prop-driven render: receives the per-tier slot, calls
 * `onRowChange` on edit. Stays mounted as long as the modal is open
 * (no longer tied to the tier card's expand/collapse state) so
 * collapsing a tier mid-edit no longer drops dirty rows.
 */

export interface MemberPricingSectionProps {
  /** The per-tier slot from PriceEditModal's modal-level state map. */
  state: MemberPricingTierState;
  /** Notify the modal that row `idx` changed. The modal owns the
   *  underlying rows[] and propagates the patch into its state map. */
  onRowChange: (idx: number, patch: Partial<MemberPricingRow>) => void;
  currencySymbol: string;
}

export function MemberPricingSection({
  state,
  onRowChange,
  currencySymbol,
}: MemberPricingSectionProps) {
  if (state.loading) {
    return (
      <div className="px-4 pt-3 pb-3 border-t border-zinc-100">
        <p className="text-[11px] text-zinc-400">Loading member pricing…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="px-4 pt-3 pb-3 border-t border-zinc-100">
        <p className="text-[11px] text-red-600">{state.error}</p>
      </div>
    );
  }

  const rows = state.rows;
  const dirtyCount = rows.filter(rowIsDirty).length;

  if (rows.length === 0) {
    return (
      <div className="px-4 pt-3 pb-3 border-t border-zinc-100">
        <p className="text-[12px] font-medium text-zinc-700">Member pricing</p>
        <p className="text-[11px] text-zinc-500 mt-1">
          No segments configured yet. Create a community segment first to offer member-only pricing on this tier.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-3 pb-3 border-t border-zinc-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] font-medium text-zinc-700">Member pricing</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Discount this tier for buyers in specific community segments.
          </p>
        </div>
        {/* Inline dirty indicator — the parent modal's Save button
            commits all dirty rows via the state map. */}
        {dirtyCount > 0 && (
          <span
            className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"
            title="Unsaved member-pricing changes — commit by clicking Save on the outer modal."
          >
            {dirtyCount} unsaved
          </span>
        )}
      </div>
      <div className="divide-y divide-zinc-100 mt-2 -mx-4">
        {rows.map((r, idx) => (
          <div key={r.segmentId} className="px-4 py-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => onRowChange(idx, { enabled: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                aria-label={`Offer member pricing for ${r.segmentName}`}
              />
              <span className="text-[12px] font-medium text-zinc-700">{r.segmentName}</span>
              {!r.enabled && (
                <span className="text-[10px] text-zinc-400 ml-auto">No override</span>
              )}
              {r.enabled && (
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 ml-auto">
                  {r.mode.replace(/_/g, " ").toLowerCase()}
                </span>
              )}
            </label>
            {r.enabled && (
              <div className="grid grid-cols-[1fr_120px_80px] gap-2 mt-2">
                <Select value={r.mode} onValueChange={(v) => onRowChange(idx, { mode: v as MemberPricingMode })}>
                  <SelectTrigger className="h-[30px] text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FREE">Free for these members</SelectItem>
                    <SelectItem value="PERCENT_OFF">% off list price</SelectItem>
                    <SelectItem value="FLAT_OFF">Flat amount off</SelectItem>
                    <SelectItem value="FIXED_PRICE">Fixed price</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="number" min="0" step={r.mode === "PERCENT_OFF" ? "1" : "0.01"}
                  value={r.value}
                  onChange={(e) => onRowChange(idx, { value: e.target.value })}
                  placeholder={
                    r.mode === "PERCENT_OFF" ? "20" :
                    r.mode === "FREE" ? "—" :
                    `${currencySymbol}10`
                  }
                  disabled={r.mode === "FREE"}
                  className="px-3 py-2 text-[12px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <input
                  type="number" step="1" value={r.priority}
                  onChange={(e) => onRowChange(idx, { priority: e.target.value })}
                  placeholder="0"
                  title="Higher priority wins when a buyer is in multiple matching segments"
                  className="px-3 py-2 text-[12px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
