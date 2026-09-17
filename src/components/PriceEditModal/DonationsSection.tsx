"use client";

import { HandCoins, Plus, X } from "lucide-react";
import type { DonationDraft } from "./types";
import { getSymbol } from "./helpers";
import { Collapse, Eyebrow, Switch } from "./_primitives";

export interface DonationsSectionProps {
  donation: DonationDraft;
  onUpdate: (patch: Partial<DonationDraft>) => void;
  defaultCurrency: string;
  /**
   * Drop the built-in header row (icon + title + explainer + enable switch)
   * and render the settings alone, always expanded.
   *
   * For the create wizard, where DonationsField already carries the switch on
   * its row and the modal writes its own heading. Without this the dialog
   * opened with a duplicate of the row that opened it, and offered a second
   * switch for the same value.
   *
   * Defaults false, so the manage-page PriceEditModal keeps the header and the
   * inline Collapse it has always had.
   */
  hideHeader?: boolean;
}

/**
 * Donation settings form — the BODY of the donations editor. It is bare
 * (no outer card) so it drops cleanly into two chrome contexts:
 *   - the create wizard's DonationsField modal / mobile drawer, and
 *   - the manage-page PriceEditModal tier list (wrapped in a card there).
 *
 * A donation is an optional contribution a buyer can add at checkout, ON TOP
 * of whatever they already pay — product/event-level, identical no matter
 * which tier they pick. This is NOT the tier-level pay-what-you-want price
 * mode (that sets the price of the item itself). Two presentations:
 *   - Suggested amounts: a chip list; the buyer taps one or types their own.
 *   - Any amount: the buyer enters any amount, above an optional minimum.
 *
 * Pure controlled component — no fetch/save; the parent persists via the
 * product/event donations endpoint. Currency follows the tier currency.
 */
export function DonationsSection({ donation, onUpdate, defaultCurrency, hideHeader = false }: DonationsSectionProps) {
  const sym = getSymbol(donation.currency || defaultCurrency);

  const addAmount = () => onUpdate({ amounts: [...donation.amounts, ""] });
  const updateAmount = (idx: number, value: string) =>
    onUpdate({ amounts: donation.amounts.map((a, i) => (i === idx ? value : a)) });
  const removeAmount = (idx: number) =>
    onUpdate({ amounts: donation.amounts.filter((_, i) => i !== idx) });

  const amountInputCls =
    "pl-7 pr-8 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div>
      {/* Enable + intro. Suppressed when the caller owns the header — see
          `hideHeader`. */}
      {!hideHeader && (
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500">
          <HandCoins className="h-[18px] w-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900">Donations</p>
          <p className="text-[12px] text-zinc-500 mt-0.5 leading-snug">
            Let buyers add an optional contribution at checkout, on top of any price. The same prompt shows no matter which ticket tier they pick.
          </p>
        </div>
        <div className="pt-0.5">
          <Switch checked={donation.enabled} onChange={(v) => onUpdate({ enabled: v })} label="Enable donations" />
        </div>
      </div>
      )}

      {/* With the header hidden the caller only mounts this when donations are
          already on, so the reveal has nothing left to animate — forcing it
          open avoids a collapsed-to-zero body on first paint. */}
      <Collapse open={hideHeader || donation.enabled}>
        {/* The top margin separates the body from the header; with no header
            the caller owns that spacing, so don't add it twice. */}
        <div className={`${hideHeader ? "" : "mt-5"} space-y-5`}>
          {/* Mode — segmented control */}
          <div>
            <Eyebrow>How buyers give</Eyebrow>
            <div className="mt-1.5 grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100">
              {([["fixed", "Suggested amounts"], ["pwyw", "Any amount"]] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onUpdate({ mode: m })}
                  className={`px-3 py-1.5 text-[13px] rounded-lg transition-colors cursor-pointer ${
                    donation.mode === m
                      ? "bg-white text-zinc-900 font-medium shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Suggested amounts — chips */}
          <Collapse open={donation.mode === "fixed"}>
            <div>
              <Eyebrow help="Buyers tap one of these, or type their own amount.">Suggested amounts</Eyebrow>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {donation.amounts.map((a, i) => (
                  <div key={i} className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">{sym}</span>
                    <input
                      type="number" min="0" step="0.01" value={a}
                      onChange={(e) => updateAmount(i, e.target.value)}
                      placeholder="10"
                      className={`w-[108px] ${amountInputCls}`}
                    />
                    {donation.amounts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAmount(i)}
                        aria-label="Remove amount"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-zinc-300 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {donation.amounts.length < 8 && (
                  <button
                    type="button"
                    onClick={addAmount}
                    className="inline-flex items-center gap-1 px-3 py-2 text-[12px] font-medium text-zinc-500 border border-dashed border-zinc-300 rounded-xl hover:border-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                )}
              </div>
            </div>
          </Collapse>

          {/* Any amount — optional minimum */}
          <Collapse open={donation.mode === "pwyw"}>
            <div>
              <Eyebrow help="The smallest a buyer can give. Leave empty for no floor.">Minimum (optional)</Eyebrow>
              <div className="relative mt-1.5 max-w-[220px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">{sym}</span>
                <input
                  type="number" min="0" step="0.01" value={donation.minAmount}
                  onChange={(e) => onUpdate({ minAmount: e.target.value })}
                  placeholder="No minimum"
                  className={`w-full ${amountInputCls}`}
                />
              </div>
            </div>
          </Collapse>

          {/* Checkout label */}
          <div>
            <Eyebrow help="The text on the button buyers tap at checkout.">Checkout label (optional)</Eyebrow>
            <input
              type="text"
              value={donation.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder={'Defaults to "Add a donation"'}
              maxLength={100}
              className="w-full mt-1.5 px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5"
            />
          </div>
        </div>
      </Collapse>
    </div>
  );
}
