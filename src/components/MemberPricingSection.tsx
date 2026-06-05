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
 * event tier — renders inside the Pricing-configuration step.
 *
 * One row per community segment: an enable toggle + (when on) a mode
 * dropdown (FREE / PERCENT_OFF / FLAT_OFF / FIXED_PRICE) + value +
 * priority. Layout matches the rest of the step — no own border/padding
 * (the parent provides the separator); rows sit in a bordered list card.
 *
 * State (segments, rows, dirty tracking, fetch/commit) lives in
 * PriceEditModal via ./PriceEditModal/member-pricing.ts; this is a pure
 * prop-driven render that calls `onRowChange` on edit.
 */

export interface MemberPricingSectionProps {
  /** The per-tier slot from PriceEditModal's modal-level state map. */
  state: MemberPricingTierState;
  /** Notify the modal that row `idx` changed. */
  onRowChange: (idx: number, patch: Partial<MemberPricingRow>) => void;
  currencySymbol: string;
}

function Heading({ dirtyCount = 0 }: { dirtyCount?: number }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-zinc-700">Member pricing</p>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          Discount this tier for buyers in specific community segments.
        </p>
      </div>
      {dirtyCount > 0 && (
        <span
          className="shrink-0 text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"
          title="Unsaved member-pricing changes — commit by clicking Save."
        >
          {dirtyCount} unsaved
        </span>
      )}
    </div>
  );
}

export function MemberPricingSection({
  state,
  onRowChange,
  currencySymbol,
}: MemberPricingSectionProps) {
  if (state.loading) {
    return (
      <div>
        <Heading />
        <p className="text-[11px] text-zinc-400 mt-2">Loading member pricing…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div>
        <Heading />
        <p className="text-[11px] text-red-600 mt-2">{state.error}</p>
      </div>
    );
  }

  const rows = state.rows;
  const dirtyCount = rows.filter(rowIsDirty).length;

  if (rows.length === 0) {
    return (
      <div>
        <Heading />
        <div className="mt-2 rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center">
          <p className="text-[11px] text-zinc-500">
            No community segments yet. Create one to offer member-only pricing on this tier.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Heading dirtyCount={dirtyCount} />

      <div className="mt-2 rounded-lg border border-zinc-200 divide-y divide-zinc-100 overflow-hidden">
        {rows.map((r, idx) => (
          <div key={r.segmentId} className={r.enabled ? "bg-zinc-50/40" : ""}>
            <label className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => onRowChange(idx, { enabled: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 cursor-pointer"
                aria-label={`Offer member pricing for ${r.segmentName}`}
              />
              <span className="text-[13px] font-medium text-zinc-800 truncate">{r.segmentName}</span>
              <span className="ml-auto text-[11px] text-zinc-400 shrink-0">
                {r.enabled ? r.mode.replace(/_/g, " ").toLowerCase() : "No override"}
              </span>
            </label>

            {r.enabled && (
              <div className="grid grid-cols-[1fr_110px_88px] gap-2 px-3 pb-3 -mt-0.5">
                <div>
                  <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1">Discount</p>
                  <Select value={r.mode} onValueChange={(v) => onRowChange(idx, { mode: v as MemberPricingMode })}>
                    <SelectTrigger className="h-9 text-[12px] bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FREE">Free for these members</SelectItem>
                      <SelectItem value="PERCENT_OFF">% off list price</SelectItem>
                      <SelectItem value="FLAT_OFF">Flat amount off</SelectItem>
                      <SelectItem value="FIXED_PRICE">Fixed price</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1">
                    {r.mode === "PERCENT_OFF" ? "Percent" : "Amount"}
                  </p>
                  <input
                    type="number" min="0" step={r.mode === "PERCENT_OFF" ? "1" : "0.01"}
                    value={r.value}
                    onChange={(e) => onRowChange(idx, { value: e.target.value })}
                    placeholder={r.mode === "PERCENT_OFF" ? "20" : r.mode === "FREE" ? "—" : `${currencySymbol}10`}
                    disabled={r.mode === "FREE"}
                    className="w-full h-9 px-3 text-[12px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1" title="Higher priority wins when a buyer is in multiple matching segments">Priority</p>
                  <input
                    type="number" step="1" value={r.priority}
                    onChange={(e) => onRowChange(idx, { priority: e.target.value })}
                    placeholder="0"
                    className="w-full h-9 px-3 text-[12px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
