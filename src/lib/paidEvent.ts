/**
 * Can anyone actually PAY for this event?
 *
 * A refund only means something when money changed hands, so the refund policy
 * (a setting) and the buyer refund line (a banner) both hang off this. "Paid"
 * is any tier that costs something OR is pay-what-you-want (the buyer names an
 * amount and pays it, so it is not free). A free tier beside a paid one still
 * makes the event paid: the paid tier can be refunded.
 *
 * Mirrors the community app's `isPaidEvent`, so the host's settings and the
 * buyer's page can never disagree about whether an event is free.
 */
export function eventHasPaidTier(event: any): boolean {
  const tiers: any[] = Array.isArray(event?.tiers) ? event.tiers : [];
  if (tiers.length > 0) {
    return tiers.some((t) => (t?.product?.price ?? t?.price ?? 0) > 0 || t?.priceMode === "pwyw");
  }
  return (event?.ticketProduct?.price ?? event?.price ?? 0) > 0;
}

/** The same question for the create form, where a tier's price is still a string. */
export function formTiersHavePaid(tiers: Array<{ price?: string | number; priceMode?: string }>): boolean {
  return (tiers ?? []).some((t) => t.priceMode === "pwyw" || Number(t.price) > 0);
}
