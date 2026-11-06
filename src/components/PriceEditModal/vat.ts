/**
 * Seller VAT arithmetic for the tier editor (backend docs/features/seller-vat.md).
 *
 * The server stores the BUYER price (VAT included). A host may type it either
 * way: "price includes VAT" (they type the buyer price) or "add VAT to the
 * price" (they type the price before VAT). These helpers convert between the
 * two in the smallest currency unit, with the same rounding as
 * @cobuntu/vat-rules (gross × r / (100 + r), half-up) so the preview matches
 * the VAT the sale will record.
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

/**
 * The rate to convert a typed amount with, or null when the amount typed is
 * already the buyer's. Member amounts follow the ticket: on a ticket priced
 * before VAT, a fixed member price or a flat discount is before VAT too, so one
 * ticket never mixes two meanings of the same field.
 */
export function netEntryRate(
  t: Pick<DraftTier, "vatCategory" | "vatPriceEntry" | "priceMode">,
  rate: number | null,
): number | null {
  return entersNet(t) && rate != null ? rate : null;
}

export function vatRateFor(options: VatOptions | null | undefined, category: DraftTier["vatCategory"]): number | null {
  if (!category || !options?.available) return null;
  const hit = options.options.find((o) => o.category === category);
  return hit ? hit.rate : null;
}

export function vatFromGrossMinor(gross: number, rate: number): number {
  if (!(gross > 0) || !(rate > 0)) return 0;
  return Math.round((gross * rate) / (100 + rate));
}

export function grossFromNetMinor(net: number, rate: number): number {
  if (!(net > 0)) return 0;
  return Math.round(net * (1 + rate / 100));
}

/** True when the tier's typed price is the price BEFORE VAT. */
export function entersNet(t: Pick<DraftTier, "vatCategory" | "vatPriceEntry" | "priceMode">): boolean {
  return !!t.vatCategory && t.vatCategory !== "EXEMPT" && t.vatPriceEntry === "ADDED" && t.priceMode !== "pwyw";
}

/**
 * The buyer price to send, as a display-unit number, for what the host typed.
 * `null` when the typed price is not a number (the existing validation reports it).
 */
export function buyerPriceToSend(t: DraftTier, rate: number | null): number | null {
  const typed = parseFloat(t.price);
  if (!Number.isFinite(typed)) return null;
  if (!entersNet(t) || rate == null) return typed;
  const gross = grossFromNetMinor(toSmallestUnit(typed, t.currency), rate);
  return parseFloat(fromSmallestUnit(gross, t.currency));
}

/** The price field to show for a stored (buyer) price, given how it was entered. */
export function typedPriceFromStored(storedMinor: number, currency: string, entry: DraftTier["vatPriceEntry"], category: DraftTier["vatCategory"], rate: number | null): string {
  if (entry === "ADDED" && category && category !== "EXEMPT" && rate != null) {
    return fromSmallestUnit(storedMinor - vatFromGrossMinor(storedMinor, rate), currency);
  }
  return fromSmallestUnit(storedMinor, currency);
}

/** Preview numbers for the editor, in the smallest unit. */
export function vatPreview(t: DraftTier, rate: number | null): { gross: number; net: number; vat: number } | null {
  const typed = parseFloat(t.price);
  if (!Number.isFinite(typed) || rate == null) return null;
  const typedMinor = toSmallestUnit(typed, t.currency);
  if (entersNet(t)) {
    const gross = grossFromNetMinor(typedMinor, rate);
    return { gross, net: typedMinor, vat: gross - typedMinor };
  }
  const vat = vatFromGrossMinor(typedMinor, rate);
  return { gross: typedMinor, net: typedMinor - vat, vat };
}
