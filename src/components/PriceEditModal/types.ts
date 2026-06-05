/**
 * Shared types for the PriceEditModal redesign.
 *
 * Extracted from the monolithic PriceEditModal.tsx as part of Phase A1/PR2.
 * Behavior identical to the old inline definitions — keeping the shapes
 * stable so the in-flight refactor can swap consumers piecemeal.
 */

/** Backend tier shape returned by GET /tiers. Installment fields are
 *  three-or-none: all three null = no plan, all three set = plan
 *  active. accessDurationMonths is intentionally absent — events bound
 *  access by event date. */
export interface Tier {
  id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  /** Non-refunded sales — backend adds this to GET /tiers responses. */
  salesCount?: number;
  priceMode?: "fixed" | "pwyw" | null;
  pwywMinAmount?: number | null;
  /** Publish + auto-schedule (feat/event-tier-publish-and-schedule).
   *  All four are nullable at the schema level; null publishedAt = draft. */
  publishedAt?: string | null;
  salesStartAt?: string | null;
  salesEndAt?: string | null;
  autoScheduleEnabled?: boolean;
  products: {
    id: string;
    price: number;
    currency: string;
    installmentTotalPrice?: number | null;
    installmentCount?: number | null;
    installmentIntervalMonths?: number | null;
  };
}

/** Local draft state for a single tier card. Fields are display-unit
 *  strings (e.g. "20" for €20) so the input rows can be authored as-is
 *  without conversion. Save flips them to smallest-unit ints. */
export interface DraftTier {
  /** Stable client-side key (drag id, react key). Survives reorders. */
  localId: string;
  /** Existing tier id; undefined for unsaved drafts. */
  id?: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  capacity: string;
  /** Whether the saved tier already has a registration form attached. */
  hasForm: boolean;
  /** Number of fields in the linked form (0 when not linked). */
  formFieldCount: number;
  /** Non-refunded sales — drives sold display + lock UI. */
  salesCount: number;
  /** 'fixed' = listed price is the price. 'pwyw' = listed price is
   *  ignored at checkout; buyer chooses an amount above pwywMin. */
  priceMode: "fixed" | "pwyw";
  /** Display-unit minimum for pwyw mode. */
  pwywMin: string;
  /** Installment plan enabled iff the three numeric fields are
   *  non-empty valid numbers. Backend enforces three-or-none. */
  installmentEnabled: boolean;
  /** Display-unit total (e.g. "300" = €300 total). */
  installmentTotal: string;
  /** Integer string (e.g. "3" = 3 charges). */
  installmentCount: string;
  /** Integer string (e.g. "1" = monthly). */
  installmentInterval: string;
  expanded: boolean;
  deleted?: boolean;
  /** When this draft was created via "Duplicate", the source's tier
   *  id. The POST body sends it as copyFormFromTierId so the backend
   *  clones the source's registration form onto the new tier in the
   *  same transaction. */
  sourceTierId?: string;
  sourceTierName?: string;
  /** Publish + auto-schedule draft state. publishedAt is the single
   *  source of truth: ISO 8601 string when published, null when draft.
   *  The UI toggle reads `!!publishedAt`; flipping off clears it,
   *  flipping back on stamps `new Date().toISOString()`.
   *  `autoScheduleEnabled` gates the start/end date pickers — the gate
   *  is metadata, not a publish-state determinant.
   *  salesStartAt / salesEndAt: ISO strings or "" when unset. */
  publishedAt: string | null;
  autoScheduleEnabled: boolean;
  salesStartAt: string;
  salesEndAt: string;
}

/** Sidecar donation config — saved separately from tiers via PUT
 *  /donations. Mirrors events.donationConfig + products.donationConfig. */
export interface DonationDraft {
  enabled: boolean;
  mode: "fixed" | "pwyw";
  /** Display-unit amounts (e.g. "5", "10", "25" for euros). */
  amounts: string[];
  /** Display-unit floor for pwyw mode. */
  minAmount: string;
  currency: string;
  label: string;
}

/** Snapshot of an existing tier captured at load time. Used to decide
 *  whether the host changed something attendees should be notified
 *  about (name or price). New tiers and changes to non-material fields
 *  like description or capacity don't enter this map. */
export interface OriginalTierSnapshot {
  name: string;
  price: string;
  currency: string;
}

export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
  /** Country/region flag emoji shown in the currency dropdown. */
  flag: string;
}

export const SUPPORTED_CURRENCIES: ReadonlyArray<SupportedCurrency> = [
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺" },
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸" },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", flag: "🇧🇷" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", flag: "🇨🇭" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$", flag: "🇨🇦" },
  { code: "AUD", name: "Australian Dollar", symbol: "$", flag: "🇦🇺" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
];
