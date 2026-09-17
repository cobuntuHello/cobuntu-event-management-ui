"use client";

import { DonationsField as SharedDonationsField } from "@cobuntu/management-ui-shared";
import type { DonationDraft } from "./types";
import { getSymbol } from "./helpers";
import { ModalShell } from "../../ui/modal-shell";

export interface DonationsFieldProps {
  donation: DonationDraft;
  onUpdate: (patch: Partial<DonationDraft>) => void;
  defaultCurrency: string;
}

/**
 * Donations on the event create-wizard pricing step.
 *
 * The editor itself now lives in @cobuntu/management-ui-shared (T-123). This
 * file used to be a full component, and the products package had a
 * BYTE-IDENTICAL copy of it. That duplication is not an abstract worry: it is
 * why this package shipped the empty-donations-modal for weeks after products
 * was fixed, and why both packages told event hosts that one prompt covers
 * every "variant" — a word that means nothing on an event.
 *
 * What is left here is the ADAPTER: the three things that are genuinely this
 * package's, bound once so no call site has to know about them.
 *
 *   - `getSymbol` — this package keeps its own SUPPORTED_CURRENCIES.
 *   - `tierNoun` — an event sells TICKET TIERS. Products pass "variant". This
 *     is the wording bug, now impossible to get wrong by construction.
 *   - `ModalShell` — this package's own responsive shell (centred dialog on
 *     desktop, drag-to-dismiss bottom sheet on mobile). The shared package has
 *     a DIFFERENT ModalShell with a different API; letting the shared editor
 *     reach for that one would have silently replaced the mobile drawer.
 *
 * Keep this a binding, not a place to add behaviour. Anything that belongs to
 * the donations editor belongs in the shared package, or the copies start
 * drifting again — which is the entire reason this file shrank.
 */
export function DonationsField(props: DonationsFieldProps) {
  return (
    <SharedDonationsField
      {...props}
      symbolFor={getSymbol}
      tierNoun="ticket tier"
      modalShell={ModalShell}
    />
  );
}
