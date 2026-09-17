"use client";

import { useState } from "react";
import { HandCoins, ChevronRight, X } from "lucide-react";
import type { DonationDraft } from "./types";
import { getSymbol } from "./helpers";
import { DonationsSection } from "./DonationsSection";
import { ModalShell } from "../../ui/modal-shell";

export interface DonationsFieldProps {
  donation: DonationDraft;
  onUpdate: (patch: Partial<DonationDraft>) => void;
  defaultCurrency: string;
}

/** One-line summary of the current donation config, for the row. */
function summarize(d: DonationDraft, sym: string): string {
  if (!d.enabled) return "Let buyers add an optional contribution at checkout";
  if (d.mode === "pwyw") {
    const min = (d.minAmount || "").trim();
    return min ? `Any amount · min ${sym}${min}` : "Any amount";
  }
  const amounts = d.amounts.filter((a) => a.trim());
  return amounts.length ? amounts.map((a) => `${sym}${a}`).join(" · ") : "Suggested amounts";
}

/**
 * Donations, as a clickable row that opens the settings in a modal (desktop)
 * or bottom-sheet drawer (mobile, via ModalShell). Lives on the create-wizard
 * pricing step OUTSIDE the variants/tiers card — a donation is listing-level,
 * not a per-tier setting, so it reads as its own thing. The same component is
 * used on both apps for both products and events.
 */
export function DonationsField({ donation, onUpdate, defaultCurrency }: DonationsFieldProps) {
  const [open, setOpen] = useState(false);
  const sym = getSymbol(donation.currency || defaultCurrency);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors text-left cursor-pointer"
      >
        <div className="h-9 w-9 shrink-0 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500">
          <HandCoins className="h-[18px] w-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-medium text-zinc-800">Donations</p>
          <p className="text-[12px] text-zinc-400 mt-0.5 truncate">{summarize(donation, sym)}</p>
        </div>
        <span className={`text-[12px] font-medium shrink-0 ${donation.enabled ? "text-zinc-600" : "text-zinc-300"}`}>
          {donation.enabled ? "On" : "Off"}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
      </button>

      {open && (
        <ModalShell onClose={() => setOpen(false)} width="w-[520px]">
          {/* Top-right close — circular muted, house modal treatment. */}
          <div className="flex justify-end -mt-1 -mr-1 mb-1">
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <DonationsSection donation={donation} onUpdate={onUpdate} defaultCurrency={defaultCurrency} />

          {/* Footer close — muted. The form auto-saves through onUpdate, so this
              just dismisses; both this and the top-right X close the modal. */}
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-5 py-2 text-[13px] font-medium rounded-xl bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </ModalShell>
      )}
    </>
  );
}
