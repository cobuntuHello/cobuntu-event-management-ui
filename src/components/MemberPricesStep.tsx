"use client";

import type { ReactNode } from "react";
import { BadgePercent } from "lucide-react";
import { formatMoney, useSharedT } from "@cobuntu/management-ui-shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { getSymbol, toSmallestUnit } from "./PriceEditModal/helpers";
import type { CommunitySegment, MemberPricingMode, MemberPricingRow } from "./PriceEditModal/member-pricing";
import type { MemberPricingScope } from "./MemberPricingSection";
import type { TierItem } from "./EventForm";

/**
 * The create wizard's "Member prices" step: a lower price per membership tier,
 * on each ticket that charges.
 *
 * Why a step of its own. Member pricing has been settable at create time since
 * 2026-09-16, first at the bottom of each ticket's editor, then (2026-11-10)
 * as a "Member prices" row under the tickets. Sellers missed both and kept
 * reporting that there was no way to give members a discount (Pathseekers,
 * 2026-11-12). The row also hid itself whenever the tier list did not load or
 * nothing was priced yet, so "missing" and "not available here" looked the
 * same. A step is always in the rail, and when nothing can be priced it says
 * why instead of showing nothing.
 *
 * Purely presentational, like the products package's step of the same name.
 * EventForm owns the rows (seeded from each ticket's `draftMemberPricing`,
 * folded back on every valid change), the tier list and its loading state, so
 * moving between steps keeps everything.
 *
 * Copy is shared.managementUi.memberPricesStep, in the shared package's
 * messages: one source for this step and the products one, translated by the
 * host through ManagementCopyProvider.
 */

export const MEMBER_PRICES_NS = "shared.managementUi.memberPricesStep";

/** A translator scoped to MEMBER_PRICES_NS (useSharedT), or a stand-in in tests. */
export type MemberPricesT = (key: string, values?: Record<string, string | number | Date>) => string;

/**
 * What is wrong with one row, or null. The same rules the ticket editor's save
 * applies (findFirstValidationError), worded for this step and with whole
 * percentages only: the backend stores an integer and buildUpsertBody would
 * otherwise drop the decimals without saying so.
 */
export function memberPriceRowError(
  r: Pick<MemberPricingRow, "enabled" | "mode" | "value" | "segmentName">,
  t: MemberPricesT,
): string | null {
  if (!r.enabled || r.mode === "FREE") return null;
  const raw = (r.value ?? "").trim();
  const v = Number(raw);
  if (raw === "" || !Number.isFinite(v) || v < 0) return t("errorValue", { tier: r.segmentName });
  if (r.mode === "PERCENT_OFF" && (!Number.isInteger(v) || v < 1 || v > 100)) {
    return t("errorPercent", { tier: r.segmentName });
  }
  return null;
}

export type MemberPricesSegmentsStatus = "loading" | "error" | "ready";

export interface MemberPricesStepProps {
  scope: MemberPricingScope;
  status: MemberPricesSegmentsStatus;
  segments: CommunitySegment[];
  /** The tickets a member price applies to (they charge, or are PWYW). */
  tiers: TierItem[];
  /** Rows per ticket, keyed by the ticket's localId. */
  rowsByTier: ReadonlyMap<string, MemberPricingRow[]>;
  /** After a refused Next: show every problem, empty amounts included. */
  showErrors?: boolean;
  onRowChange: (localId: string, segmentId: string, patch: Partial<MemberPricingRow>) => void;
  onRetry: () => void;
}

function listPriceText(tier: TierItem, t: MemberPricesT): string {
  if (tier.priceMode === "pwyw") return t("payWhatYouWant");
  const raw = (tier.price ?? "").trim();
  const n = parseFloat(raw);
  if (raw === "" || Number.isNaN(n)) return t("priceNotSet");
  const currency = (tier.currency || "EUR").toUpperCase();
  return formatMoney(toSmallestUnit(n, currency), currency);
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-zinc-50 px-4 py-4">
      <span className="flex items-center justify-center w-[30px] h-[30px] rounded-full bg-amber-100 text-amber-600 shrink-0">
        <BadgePercent className="h-4 w-4" />
      </span>
      <div className="min-w-0 text-sm text-zinc-600 pt-1">{children}</div>
    </div>
  );
}

export function MemberPricesStep({
  scope,
  status,
  segments,
  tiers,
  rowsByTier,
  showErrors,
  onRowChange,
  onRetry,
}: MemberPricesStepProps) {
  const t = useSharedT(MEMBER_PRICES_NS);
  let body: ReactNode;
  if (status === "loading") {
    body = <p className="text-sm text-zinc-400">{t("loading")}</p>;
  } else if (status === "error") {
    body = (
      <Note>
        <span>{t("loadFailed")}</span>{" "}
        <button
          type="button"
          onClick={onRetry}
          className="font-medium text-zinc-800 underline underline-offset-2 cursor-pointer"
        >
          {t("retry")}
        </button>
      </Note>
    );
  } else if (segments.length === 0) {
    body = <Note>{t(scope === "seller" ? "noTiersSeller" : "noTiersCommunity")}</Note>;
  } else if (tiers.length === 0) {
    body = <Note>{t("nothingPriced")}</Note>;
  } else {
    body = tiers.map((tier) => {
      const rows = rowsByTier.get(tier.localId) ?? [];
      const sym = getSymbol(tier.currency || "EUR");
      return (
        <div key={tier.localId} className="rounded-2xl border border-zinc-100 overflow-hidden" data-testid="member-prices-ticket">
          <div className="flex items-baseline justify-between gap-3 px-4 py-3 bg-zinc-50">
            <span className="min-w-0 truncate text-sm font-medium text-zinc-800">{tier.name.trim()}</span>
            <span className="shrink-0 text-[12.5px] text-zinc-500">{listPriceText(tier, t)}</span>
          </div>
          <div className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const error = memberPriceRowError(r, t);
              // An empty amount on a freshly ticked tier is the normal way to
              // start, so it is only called out after a refused Next; a wrong
              // value someone has typed shows at once.
              const showError = !!error && (showErrors || r.value.trim() !== "");
              return (
                <div key={r.segmentId} className="px-4 py-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => onRowChange(tier.localId, r.segmentId, { enabled: e.target.checked })}
                      aria-label={t("offerTo", { tier: r.segmentName })}
                      className="h-4 w-4 rounded border-zinc-300 cursor-pointer accent-[var(--brand-color,#18181b)]"
                    />
                    <span className="min-w-0 truncate text-sm text-zinc-800">{r.segmentName}</span>
                  </label>
                  {r.enabled && (
                    <div className="mt-2.5 ml-7 flex flex-wrap items-center gap-2">
                      <Select
                        value={r.mode}
                        onValueChange={(v) => onRowChange(tier.localId, r.segmentId, { mode: v as MemberPricingMode })}
                      >
                        <SelectTrigger className="h-9 w-[190px] text-[13px]" aria-label={t("modeLabel", { tier: r.segmentName })}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FIXED_PRICE">{t("modeFixed")}</SelectItem>
                          <SelectItem value="PERCENT_OFF">{t("modePercent")}</SelectItem>
                          <SelectItem value="FLAT_OFF">{t("modeFlat")}</SelectItem>
                          <SelectItem value="FREE">{t("modeFree")}</SelectItem>
                        </SelectContent>
                      </Select>
                      {r.mode !== "FREE" && (
                        <div className="relative">
                          {r.mode !== "PERCENT_OFF" && (
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">{sym}</span>
                          )}
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={r.mode === "PERCENT_OFF" ? 100 : undefined}
                            step={r.mode === "PERCENT_OFF" ? 1 : 0.01}
                            value={r.value}
                            onChange={(e) => onRowChange(tier.localId, r.segmentId, { value: e.target.value })}
                            aria-label={t("valueLabel", { tier: r.segmentName })}
                            aria-invalid={showError || undefined}
                            className={`h-9 w-[120px] ${r.mode === "PERCENT_OFF" ? "pl-3 pr-8" : "pl-7 pr-3"} text-[13px] text-zinc-900 border rounded-lg focus:outline-none ${showError ? "border-red-300 focus:border-red-400" : "border-zinc-200 focus:border-zinc-400"} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                          />
                          {r.mode === "PERCENT_OFF" && (
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">%</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {showError && <p className="mt-2 ml-7 text-[12px] text-red-600" role="alert">{error}</p>}
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  }

  return (
    <section className="space-y-4" data-testid="member-prices-step">
      <p className="text-sm text-zinc-500">{t(scope === "seller" ? "introSeller" : "introCommunity")}</p>
      {body}
    </section>
  );
}
