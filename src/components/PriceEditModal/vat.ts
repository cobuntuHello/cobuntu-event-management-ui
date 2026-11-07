/**
 * Seller VAT arithmetic for the tier editor (backend docs/features/seller-vat.md).
 *
 * Every price is entered, stored and shown BEFORE VAT. Checkout decides the VAT
 * from live data and adds it on top, so nothing here converts a price: these
 * helpers only preview what the buyer pays at checkout, rounded as the backend
 * and Stripe round it (net x rate / 100, half up).
 */
import { toSmallestUnit, fromSmallestUnit } from "./helpers";
import type { DraftTier, VatOptions } from "./types";

export function money(minor: number, currency: string): string {
  const n = Number(fromSmallestUnit(minor, currency));
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function vatRateFor(options: VatOptions | null | undefined, category: DraftTier["vatCategory"]): number | null {
  if (!category || !options?.available) return null;
  const hit = options.options.find((o) => o.category === category);
  return hit ? hit.rate : null;
}

/** The VAT checkout adds on top of a price before VAT: 3000 at 23% -> 690. */
export function vatOnNetMinor(net: number, rate: number): number {
  if (!(net > 0) || !(rate > 0)) return 0;
  return Math.round((net * rate) / 100);
}

/** True when the ticket has VAT added at checkout, so its price is labelled "before VAT". */
export function entersNet(t: Pick<DraftTier, "vatCategory">): boolean {
  return !!t.vatCategory && t.vatCategory !== "EXEMPT";
}

/** The price to send: always what the host typed, which is before VAT. */
export function buyerPriceToSend(t: DraftTier, _rate?: number | null): number | null {
  const typed = parseFloat(t.price);
  return Number.isFinite(typed) ? typed : null;
}

/** The price field for a stored price: the same number, since prices are stored as typed. */
export function typedPriceFromStored(storedMinor: number, currency: string, ..._legacy: unknown[]): string {
  return fromSmallestUnit(storedMinor, currency);
}

/** What buyers pay at checkout for the typed price, in the smallest unit. */
export function vatPreview(t: DraftTier, rate: number | null): { gross: number; net: number; vat: number } | null {
  const typed = parseFloat(t.price);
  if (!Number.isFinite(typed) || rate == null) return null;
  const net = toSmallestUnit(typed, t.currency);
  const vat = vatOnNetMinor(net, rate);
  return { gross: net + vat, net, vat };
}
