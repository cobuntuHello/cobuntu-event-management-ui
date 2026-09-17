"use client";

import { useState } from "react";
import { HandCoins, ChevronRight } from "lucide-react";
import type { DonationDraft } from "./types";
import { getSymbol } from "./helpers";
import { DonationsSection } from "./DonationsSection";
import { Switch } from "./_primitives";
import { ModalShell } from "../../ui/modal-shell";

export interface DonationsFieldProps {
  donation: DonationDraft;
  onUpdate: (patch: Partial<DonationDraft>) => void;
  defaultCurrency: string;
}

/**
 * One-line summary of the current donation config, for the row.
 *
 * When donations are OFF this states the STATE rather than pitching the
 * feature. The row now carries its own switch, so "Let buyers add an optional
 * contribution…" read as an instruction to press something that wasn't there;
 * its neighbours ("Require approval", "Can be bought more than once") all
 * describe what they currently do.
 */
function summarize(d: DonationDraft, sym: string): string {
  if (!d.enabled) return "Off · buyers can add a contribution at checkout";
  if (d.mode === "pwyw") {
    const min = (d.minAmount || "").trim();
    return min ? `Any amount · min ${sym}${min}` : "Any amount";
  }
  const amounts = d.amounts.filter((a) => a.trim());
  return amounts.length ? amounts.map((a) => `${sym}${a}`).join(" · ") : "Suggested amounts";
}

/**
 * Donations on the create-wizard pricing step: a row that owns its own switch,
 * and drills into the settings modal ONLY once it is on.
 *
 * ── Why the switch is on the row ──────────────────────────────────────────
 *
 * This used to be a pure drill-in: the whole row opened a modal, and the switch
 * lived inside it. That made the dialog EMPTY in its most common state.
 * `DonationsSection` is a header plus `<Collapse open={enabled}>`, so with
 * donations off there is nothing to collapse open and the modal was one switch
 * and two different ways to close it. Everything that read as wrong about it
 * followed from that: the dead space, the ✕-plus-Close pair, the right-aligned
 * Close sitting where a primary action goes.
 *
 * It was also the odd one out on its own step. "Require approval" and "Can be
 * bought more than once" sit beside it as inline toggle rows; only Donations
 * made you open a dialog to flip a switch.
 *
 * So: switch on the row (one tap, same as its neighbours), and the chevron
 * appears only when it leads somewhere. A chevron promises a destination; it
 * should not promise a dialog containing the control you just walked past.
 *
 * Donations remain listing-level, not per-tier — that is why this sits OUTSIDE
 * the ticket-tiers card and why one prompt covers every tier. The settings
 * themselves (mode, amounts, minimum, label) are real config and still earn a
 * modal, once there is something to configure.
 *
 * `DonationsSection` is unchanged and keeps its `Collapse`: on the manage page
 * it renders inside a tier card in `PriceEditModal`, where revealing inline is
 * the right behaviour. Only this wizard chrome changes. Because the section
 * still renders its own header + switch, it is asked to hide them here
 * (`hideHeader`) so the modal does not repeat the row you opened it from.
 */
export function DonationsField({ donation, onUpdate, defaultCurrency }: DonationsFieldProps) {
  const [open, setOpen] = useState(false);
  const sym = getSymbol(donation.currency || defaultCurrency);

  /*
   * Turning donations OFF closes the editor. Leaving it open would strand the
   * reader in a modal whose body has just collapsed to nothing — the exact
   * empty dialog this change exists to remove.
   */
  const setEnabled = (next: boolean) => {
    onUpdate({ enabled: next });
    if (!next) setOpen(false);
  };

  return (
    <>
      {/* Matches the wizard's other rows: zinc-50 card, w-8 rounded-lg icon
          tile, 13px/11px text. The row is a plain <div> rather than a button —
          it holds two controls now, and a button wrapping a switch is neither
          valid nor keyboard-navigable. */}
      <div className="group w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-zinc-50 transition-colors">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
            donation.enabled ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-600"
          }`}
        >
          <HandCoins className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-zinc-800">Donations</p>
          <p className="text-[11px] text-zinc-400 truncate">{summarize(donation, sym)}</p>
        </div>

        {/* Edit is its own target, and only exists when enabled. */}
        {donation.enabled && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Edit donation settings"
            className="flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg text-[12px] font-medium text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            Edit
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
        )}

        <Switch checked={donation.enabled} onChange={setEnabled} label="Enable donations" />
      </div>

      {open && (
        <ModalShell onClose={() => setOpen(false)} width="w-[520px]">
          {/* The modal owns its own heading, so the section's header is
              suppressed — otherwise the dialog opens with a copy of the row
              that opened it. */}
          <div className="px-1">
            <p className="text-[14px] font-semibold text-zinc-900">Donations</p>
            <p className="text-[12px] text-zinc-500 mt-0.5 leading-snug">
              An optional contribution at checkout, on top of any price. The same prompt shows for every ticket tier.
            </p>
          </div>

          <div className="mt-4 px-1">
            <DonationsSection
              donation={donation}
              onUpdate={onUpdate}
              defaultCurrency={defaultCurrency}
              hideHeader
            />
          </div>

          {/*
           * ONE dismissal, full-width and muted at the bottom.
           *
           * House rule: a top-right ✕ belongs to a modal that owns a primary
           * action and needs a secondary escape. This form auto-saves through
           * `onUpdate`, so dismissal is the whole story and the bottom bar is
           * the correct shape. Previously it had both, which left the reader
           * choosing between two controls that did the same thing.
           */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-6 -mx-5 -mb-5 w-[calc(100%+2.5rem)] border-t border-zinc-200/70 bg-zinc-50 py-3 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer rounded-b-2xl"
          >
            Close
          </button>
        </ModalShell>
      )}
    </>
  );
}
