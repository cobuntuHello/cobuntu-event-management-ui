/**
 * The "Member prices" row on the event create wizard's tickets step.
 *
 * Member pricing has always been reachable while creating an event, but only
 * at the bottom of each ticket's editor, below its price and billing setup.
 * Sellers did not find it (reported 2026-11-10 for products; events hid it the
 * same way). The row puts it on the step itself, says what is set, and opens
 * the ticket's editor at that section. Mirrors product-management-ui's
 * memberPricesRow.ts.
 */
import { formatMoney } from "@cobuntu/management-ui-shared";
import type { CommunitySegment, MemberPricingUpsert } from "./PriceEditModal/member-pricing";

/**
 * A ticket a member price means something on: one that charges, including
 * pay-what-you-want, and a "Paid entry" ticket whose price is still blank
 * ("Price needed" is not "Free").
 */
export function ticketTakesMemberPricing(t: { price?: string | null; priceMode?: "fixed" | "pwyw" | null }): boolean {
  if (t.priceMode === "pwyw") return true;
  const raw = (t.price ?? "").trim();
  if (raw === "") return true;
  const p = parseFloat(raw);
  return !Number.isNaN(p) && p > 0;
}

function describe(row: MemberPricingUpsert, currency: string): string {
  switch (row.mode) {
    case "FREE":
      return "free";
    case "PERCENT_OFF":
      return `${row.value ?? 0}% off`;
    case "FLAT_OFF":
      return `${formatMoney(row.value ?? 0, currency.toUpperCase())} off`;
    case "FIXED_PRICE":
    default:
      return formatMoney(row.value ?? 0, currency.toUpperCase());
  }
}

/**
 * "Members €65.00 · Supporters 20% off", or null when the ticket has no member
 * prices yet. A tier the community no longer lists is named "A tier" rather
 * than dropped.
 */
export function memberPricingSummary(
  t: { draftMemberPricing?: MemberPricingUpsert[] | null; currency?: string | null },
  segments: Pick<CommunitySegment, "id" | "name">[],
): string | null {
  const rows = (t.draftMemberPricing ?? []).filter((r) => !!r?.segmentId);
  if (rows.length === 0) return null;
  const nameOf = (id: string) => segments.find((s) => s.id === id)?.name || "A tier";
  return rows.map((r) => `${nameOf(r.segmentId)} ${describe(r, t.currency || "EUR")}`).join(" · ");
}
