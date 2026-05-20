"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useEventManagementConfig, useJsonHeaders } from "../config";

/**
 * Member-pricing editor for a single (community-owned) event tier.
 *
 * Renders one row per community segment, each with an enable toggle +
 * mode dropdown (FREE / PERCENT_OFF / FLAT_OFF / FIXED_PRICE) + value
 * + priority. recurringScope is omitted — events tiers are not
 * recurring (events checkout uses Stripe mode='payment'), so the
 * field would never matter on this surface.
 *
 * Backend endpoints (shipped in PR mp-04):
 *   GET    /communities/:tag/tiers/:tierId/member-pricing
 *   POST   /communities/:tag/tiers/:tierId/member-pricing      (upsert by tierId+segmentId)
 *   PUT    /communities/:tag/tiers/:tierId/member-pricing/:id
 *   DELETE /communities/:tag/tiers/:tierId/member-pricing/:id
 *
 * Community-only. The parent PriceEditModal only mounts this when the
 * `showMemberPricing` prop is true; admin passes true (admin only
 * edits community-owned items today), community-app `/manage` passes
 * false / omits (user-owned items don't get the section).
 *
 * **Commit model** — Phase A1/PR2 of the redesign:
 * This component no longer renders its own Save button. Instead the
 * parent modal holds a ref per mounted section and invokes the
 * `commit()` imperative API during its single modal-level save flow.
 * Eliminates the dual-Save UX issue (modal-level Save + per-section
 * Save) the user flagged in the redesign feedback.
 */

interface CommunitySegment {
  id: string;
  name: string;
  color?: string | null;
}

type Mode = "FREE" | "PERCENT_OFF" | "FLAT_OFF" | "FIXED_PRICE";

interface MemberPricingRow {
  /** Override row id, present only when the buyer has saved at least
   *  one override for this (tier, segment). */
  id?: string;
  segmentId: string;
  segmentName: string;
  enabled: boolean;
  mode: Mode;
  /** Display string. Mode-dependent: FREE ignores it, PERCENT_OFF
   *  is 1–100, FLAT_OFF / FIXED_PRICE are smallest unit (cents). */
  value: string;
  priority: string;
  /** Snapshot of the initial loaded shape so the save loop can tell
   *  whether the row changed. */
  initial?: {
    enabled: boolean;
    mode: Mode;
    value: string;
    priority: string;
    id?: string;
  };
}

export interface MemberPricingSectionProps {
  communityTag: string;
  /** Tier id (saved tiers only — caller should hide the section for
   *  unsaved drafts). */
  tierId: string;
  /** Currency symbol used to format flat / fixed amounts. */
  currencySymbol: string;
  currencyCode: string;
  showToast: (msg: string) => void;
}

export interface MemberPricingSectionHandle {
  /** Called by the parent modal during its global Save. Throws on
   *  validation or API failure so the parent can surface the error in
   *  its own confirm-state machine. Resolves once all dirty rows have
   *  been written and local "initial" baselines reset. */
  commit(): Promise<void>;
  /** Whether any row diverges from its initial snapshot. Lets the parent
   *  decide whether to skip the commit() round-trip entirely. */
  isDirty(): boolean;
}

function toSmallestUnit(majorAmount: number, currency: string): number {
  return currency === "JPY" ? Math.round(majorAmount) : Math.round(majorAmount * 100);
}

function fromSmallestUnit(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "";
  return String(currency === "JPY" ? amount : amount / 100);
}

function rowIsDirty(r: MemberPricingRow): boolean {
  if (!r.initial) return r.enabled;
  return r.enabled !== r.initial.enabled
    || r.mode !== r.initial.mode
    || r.value.trim() !== r.initial.value.trim()
    || r.priority.trim() !== r.initial.priority.trim();
}

function validateRow(r: MemberPricingRow): string | null {
  if (!r.enabled) return null;
  if (r.mode === "FREE") return null;
  const v = parseFloat(r.value);
  if (isNaN(v) || v < 0) return `${r.segmentName}: value must be a non-negative number.`;
  if (r.mode === "PERCENT_OFF" && (v < 1 || v > 100)) {
    return `${r.segmentName}: percent off must be between 1 and 100.`;
  }
  return null;
}

export const MemberPricingSection = forwardRef<
  MemberPricingSectionHandle,
  MemberPricingSectionProps
>(function MemberPricingSection(
  { communityTag, tierId, currencySymbol, currencyCode },
  ref,
) {
  const { apiBaseUrl, authHeaders } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MemberPricingRow[]>([]);

  // Fetch segments + existing overrides on mount. Two endpoints, but
  // both small + parallel-safe; the join happens in JS so we don't
  // need a single richer endpoint for v1.
  useEffect(() => {
    (async () => {
      try {
        const [segRes, ovRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/communities/${communityTag}/segments`, { headers: authHeaders() }),
          fetch(`${apiBaseUrl}/api/communities/${communityTag}/tiers/${tierId}/member-pricing`, { headers: authHeaders() }),
        ]);
        if (!segRes.ok) throw new Error("Could not load community segments.");
        const segments: CommunitySegment[] = await segRes.json();
        const overrides: any[] = ovRes.ok ? await ovRes.json() : [];

        const byId = new Map<string, any>(overrides.map(o => [o.segmentId, o]));
        const built: MemberPricingRow[] = segments.map(s => {
          const o = byId.get(s.id);
          const valueRaw: string = o
            ? (o.mode === "FLAT_OFF" || o.mode === "FIXED_PRICE")
              ? fromSmallestUnit(o.value, currencyCode)
              : String(o.value ?? "")
            : "";
          const initial = {
            enabled: !!o,
            mode: (o?.mode as Mode) ?? "PERCENT_OFF",
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
        setRows(built);
      } catch (e: any) {
        setError(e.message || "Failed to load member pricing");
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityTag, tierId, apiBaseUrl]);

  function updateRow(idx: number, patch: Partial<MemberPricingRow>) {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  // Imperative API consumed by the parent modal's global Save handler.
  // Reads the latest rows from a closure-stable ref so callers always
  // see current state regardless of when they called commit().
  useImperativeHandle(ref, () => ({
    isDirty: () => rows.some(rowIsDirty),
    commit: async () => {
      setError(null);
      for (const r of rows) {
        const err = validateRow(r);
        if (err) throw new Error(err);
      }

      for (const r of rows) {
        if (!rowIsDirty(r)) continue;

        // Existing row → disabled now → DELETE.
        if (r.initial?.enabled && !r.enabled && r.initial.id) {
          const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/tiers/${tierId}/member-pricing/${r.initial.id}`, {
            method: "DELETE", headers: authHeaders(),
          });
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error || `Failed to remove override for ${r.segmentName}`);
          }
          continue;
        }

        // Enabled (new or updated) → POST upsert. Per-mode value
        // conversion: FLAT_OFF / FIXED_PRICE expect smallest unit,
        // PERCENT_OFF expects 1-100 (no conversion).
        if (r.enabled) {
          let backendValue = 0;
          if (r.mode === "PERCENT_OFF") {
            backendValue = parseInt(r.value, 10);
          } else if (r.mode === "FLAT_OFF" || r.mode === "FIXED_PRICE") {
            backendValue = toSmallestUnit(parseFloat(r.value), currencyCode);
          }
          const body = {
            segmentId: r.segmentId,
            mode: r.mode,
            value: backendValue,
            priority: parseInt(r.priority || "0", 10) || 0,
          };
          const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/tiers/${tierId}/member-pricing`, {
            method: "POST", headers: jsonHeaders(), body: JSON.stringify(body),
          });
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error || `Failed to save override for ${r.segmentName}`);
          }
        }
      }

      // Refresh the local "initial" baseline so dirty-tracking resets.
      setRows(rs => rs.map(r => ({
        ...r,
        initial: {
          enabled: r.enabled,
          mode: r.mode,
          value: r.value,
          priority: r.priority,
          id: r.id ?? r.initial?.id,
        },
      })));
    },
  // The ref handle should re-bind whenever `rows` changes so commit()
  // sees the latest draft state. authHeaders/jsonHeaders are stable
  // closures from the config provider so excluding them is intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, apiBaseUrl, communityTag, tierId, currencyCode]);

  const dirtyCount = rows.filter(rowIsDirty).length;

  if (loading) {
    return (
      <div className="px-4 pt-3 pb-3 border-t border-zinc-100">
        <p className="text-[11px] text-zinc-400">Loading member pricing…</p>
      </div>
    );
  }

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
        {/* Inline dirty indicator — replaces the old per-section Save
            button. The parent modal's Save button commits all dirty
            rows via the imperative ref API. */}
        {dirtyCount > 0 && (
          <span
            className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"
            title="Unsaved member-pricing changes — commit by clicking Save on the outer modal."
          >
            {dirtyCount} unsaved
          </span>
        )}
      </div>
      {error && (
        <p className="text-[11px] text-red-600 mt-1.5">{error}</p>
      )}
      <div className="divide-y divide-zinc-100 mt-2 -mx-4">
        {rows.map((r, idx) => (
          <div key={r.segmentId} className="px-4 py-2">
            {/* The leftmost checkbox toggles whether THIS SEGMENT gets
                an override (any override, regardless of mode). The
                old label simply showed the segment name, which made
                hosts read the row's selected mode (e.g. "FREE") as
                the action — confusing because FREE means "override
                price to zero", not "disable the override". The label
                now explicitly names what the checkbox does. */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={e => updateRow(idx, { enabled: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                aria-label={`Offer member pricing for ${r.segmentName}`}
              />
              <span className="text-[12px] font-medium text-zinc-700">{r.segmentName}</span>
              {!r.enabled && (
                <span className="text-[10px] text-zinc-400 ml-auto">
                  No override
                </span>
              )}
              {r.enabled && (
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 ml-auto">
                  {r.mode.replace(/_/g, " ").toLowerCase()}
                </span>
              )}
            </label>
            {r.enabled && (
              <div className="grid grid-cols-[1fr_120px_80px] gap-2 mt-2">
                <Select value={r.mode} onValueChange={v => updateRow(idx, { mode: v as Mode })}>
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
                  onChange={e => updateRow(idx, { value: e.target.value })}
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
                  onChange={e => updateRow(idx, { priority: e.target.value })}
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
});
