"use client";

import { DonationsSection as SharedDonationsSection } from "@cobuntu/management-ui-shared";
import type { DonationDraft } from "./types";
import { getSymbol } from "./helpers";

export interface DonationsSectionProps {
  donation: DonationDraft;
  onUpdate: (patch: Partial<DonationDraft>) => void;
  defaultCurrency: string;
  /** Drop the built-in header row; the caller owns the heading and the switch. */
  hideHeader?: boolean;
}

/**
 * The donation settings FORM, bound to this package.
 *
 * Body only, no outer card, so it drops into both chrome contexts: the create
 * wizard's modal (via DonationsField) and the manage-page tier list (wrapped in
 * a card there). The implementation is shared — see DonationsField.tsx for why
 * this is an adapter and what the seams are.
 */
export function DonationsSection(props: DonationsSectionProps) {
  return <SharedDonationsSection {...props} symbolFor={getSymbol} tierNoun="ticket tier" />;
}
