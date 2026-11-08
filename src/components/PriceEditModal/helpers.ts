/**
 * Pure helpers for the PriceEditModal redesign.
 *
 * Currency conversion, blank-row builders, validation. Extracted from
 * the monolithic file so the directory layout can test these in
 * isolation without mounting the whole modal.
 */

import { buyerPriceToSend, entersNet } from "./vat";
import {
  SUPPORTED_CURRENCIES,
  TIER_NAME_MAX,
  TIER_DESCRIPTION_MAX,
  type DonationDraft,
  type DraftTier,
} from "./types";
import { getEventT } from "../../create-wizard/i18n";

/*
 * These helpers run outside components (validation in the save loop, blank-row
 * builders), so they read the host translator through getEventT rather than a
 * hook. The English defaults are byte-identical to the strings they replaced.
 */
const tr = () => getEventT("eventsUi.manageUi.pricingHelpers");

/**
 * Turns a failed tier/donation save's JSON body into a message, with a
 * defensive, OWNERSHIP-aware special case for the backend's save-time Stripe
 * gate.
 *
 * `EventTierService.createTier`/`updateTier` and
 * `DonationConfigService.setForEvent` reject a paid tier or an enabled
 * donation config with `{ code: "STRIPE_NOT_CONNECTED", ownerType, ownerId }`
 * when there is nowhere to pay the money out to — checked at SAVE time, on
 * every save (not just first activation), because a price or a donation
 * toggle can be edited back on after Stripe was disconnected just as easily
 * as it can be set for the first time.
 *
 * Checked by the PRESENCE of `code`, not by matching the whole shape: the
 * body also carries `ownerType`/`ownerId`, which this UI doesn't need and
 * shouldn't have to mirror exactly to recognize its own gate. Any other
 * error shape falls through to `e.error` (the generic server message) or
 * `fallback`, unchanged from before this gate existed.
 */
export function describeSaveError(
  e: { code?: string; error?: string } | null | undefined,
  fallback: string,
  isPersonalEvent: boolean,
): string {
  if (e?.code === "STRIPE_NOT_CONNECTED") {
    return isPersonalEvent
      ? tr()("stripeNotConnectedPersonal")
      : tr()("stripeNotConnectedCommunity");
  }
  return e?.error || fallback;
}

export function getSymbol(code: string): string {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code)?.symbol || code;
}

/** Smallest unit → display unit (e.g. 2000 cents EUR → 20). JPY has
 *  no fractional unit so the smallest unit IS the display unit. */
export function toDisplay(price: number, currency: string): number {
  return currency === "JPY" ? price : price / 100;
}

/** Display unit → smallest unit (e.g. 20 EUR → 2000 cents). */
export function toSmallestUnit(majorAmount: number, currency: string): number {
  return currency === "JPY" ? Math.round(majorAmount) : Math.round(majorAmount * 100);
}

/** Smallest unit → display-string. Used to seed input fields. Null/
 *  undefined inputs collapse to empty string so React doesn't warn
 *  about controlled/uncontrolled flips. */
export function fromSmallestUnit(
  smallestAmount: number | null | undefined,
  currency: string,
): string {
  if (smallestAmount == null) return "";
  return String(currency === "JPY" ? smallestAmount : smallestAmount / 100);
}

function newLocalId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `local-${Math.random().toString(36).slice(2)}`;
}

export function blankTier(currency = "EUR", indexHint = 1): DraftTier {
  return {
    localId: newLocalId(),
    name: indexHint === 1 ? tr()("defaultTierName") : tr()("tierN", { n: indexHint }),
    description: "",
    price: "",
    currency,
    capacity: "",
    hasForm: false,
    formFieldCount: 0,
    salesCount: 0,
    priceMode: "fixed",
    pwywMin: "",
    installmentEnabled: false,
    installmentTotal: "",
    installmentCount: "",
    installmentInterval: "1",
    expanded: true,
    // New tiers start published — matches the natural "create + ship"
    // flow. Hosts who want to stage a draft flip the toggle off before
    // saving. Hidden state for the auto-schedule pickers.
    publishedAt: new Date().toISOString(),
    autoScheduleEnabled: false,
    salesStartAt: "",
    salesEndAt: "",
  };
}

export function blankDonation(currency = "EUR"): DonationDraft {
  return {
    enabled: false,
    mode: "fixed",
    amounts: ["5", "10", "25"],
    minAmount: "",
    currency,
    label: "",
    // A new event asks at both moments by default (product decision
    // 2026-11-08): sign-up, and the "How was it?" review after the event.
    moments: { checkout: true, afterEvent: true },
  };
}

/** Builds a DonationDraft from an event's donationConfig sidecar.
 *  Falls back to a blank draft (with the event's currency) when the
 *  field is missing or malformed. */
export function loadDonationFromEvent(event: { donationConfig?: unknown; currency?: string } | null | undefined): DonationDraft {
  const cfg = event?.donationConfig as Record<string, any> | undefined;
  if (!cfg || typeof cfg !== "object") {
    return blankDonation(event?.currency || "EUR");
  }
  const currency: string = cfg.currency || event?.currency || "EUR";
  const mode: "fixed" | "pwyw" = cfg.mode === "pwyw" ? "pwyw" : "fixed";
  const amounts: string[] = Array.isArray(cfg.amounts) && cfg.amounts.length > 0
    ? cfg.amounts.map((a: number) => fromSmallestUnit(a, currency))
    : ["5", "10", "25"];
  const minAmount: string = cfg.minAmount != null ? fromSmallestUnit(cfg.minAmount, currency) : "";
  return {
    enabled: !!cfg.enabled,
    mode,
    amounts,
    minAmount,
    currency,
    label: cfg.label || "",
    // Absent on events saved before moments existed = both, which is how
    // they behaved; the editor shows it, and the next save writes it down.
    moments: {
      checkout: cfg.moments?.checkout !== false,
      afterEvent: cfg.moments?.afterEvent !== false,
    },
  };
}

/** Validate one tier draft. Returns null when valid, an error message
 *  otherwise. Called per-tier in the global save loop; surfacing the
 *  first failure stops the loop. */
export function validateTier(t: DraftTier): string | null {
  if (!t.name.trim()) return tr()("tierNameRequired");
  if (t.name.length > TIER_NAME_MAX) {
    return tr()("tierNameTooLong", { max: TIER_NAME_MAX });
  }
  if (t.description.length > TIER_DESCRIPTION_MAX) {
    return tr()("descriptionTooLong", { name: t.name, max: TIER_DESCRIPTION_MAX });
  }
  if (t.price === "" || isNaN(parseFloat(t.price))) {
    return tr()("priceRequired", { name: t.name });
  }
  if (t.priceMode === "pwyw" && t.pwywMin.trim()) {
    const min = parseFloat(t.pwywMin);
    if (isNaN(min) || min < 0) {
      return tr()("pwywMinInvalid", { name: t.name });
    }
  }
  if (t.installmentEnabled) {
    const total = parseFloat(t.installmentTotal);
    const count = parseInt(t.installmentCount, 10);
    const interval = parseInt(t.installmentInterval, 10);
    if (isNaN(total) || total <= 0) {
      return tr()("installmentTotalInvalid", { name: t.name });
    }
    if (isNaN(count) || count < 2) {
      return tr()("installmentCountInvalid", { name: t.name });
    }
    if (isNaN(interval) || interval < 1) {
      return tr()("installmentIntervalInvalid", { name: t.name });
    }
  }
  // Auto-schedule sales window. Enabling it with no bounds at all is a
  // no-op (opens-on-publish + open-ended = same as off) — block it so the
  // host doesn't think they scheduled something. When both bounds are set,
  // close must be strictly after open.
  if (t.autoScheduleEnabled) {
    if (!t.salesStartAt && !t.salesEndAt) {
      return tr()("scheduleNoDates", { name: t.name });
    }
    if (t.salesStartAt && t.salesEndAt) {
      const start = new Date(t.salesStartAt).getTime();
      const end = new Date(t.salesEndAt).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
        return tr()("scheduleCloseBeforeOpen", { name: t.name });
      }
    }
  }
  return null;
}

export function validateDonation(d: DonationDraft): string | null {
  if (!d.enabled) return null;
  if (d.mode === "fixed") {
    const trimmed = d.amounts.map((a) => a.trim());
    const hasBlank = trimmed.some((a) => a === "");
    if (hasBlank) return tr()("donationBlankAmounts");
    const invalid = trimmed.find((a) => {
      const n = parseFloat(a);
      return isNaN(n) || n <= 0;
    });
    if (invalid !== undefined) {
      return tr()("donationAmountInvalid", { amount: invalid });
    }
    if (trimmed.length === 0) {
      return tr()("donationAmountsRequired");
    }
  }
  if (d.mode === "pwyw" && d.minAmount.trim()) {
    const n = parseFloat(d.minAmount);
    if (isNaN(n) || n < 0) {
      return tr()("donationMinInvalid");
    }
  }
  return null;
}

/** A tier is "locked" once it has paid sales — price + currency +
 *  pricing mode become immutable server-side. Brand-new tiers (no id)
 *  are never locked. */
export function isTierLocked(t: DraftTier): boolean {
  return !!t.id && t.salesCount > 0;
}

/** Whether any draft has a non-zero price. Drives the
 *  StripeRequiredWarning gate — Stripe needs onboarding for paid
 *  flows but not for free events. */
export function hasPaidTier(drafts: DraftTier[]): boolean {
  return drafts.some(
    (t) => !t.deleted && parseFloat(t.price || "0") > 0,
  );
}

/** Builds the per-tier POST/PUT body. Locked tiers omit price /
 *  currency / priceMode / installment fields so the existing
 *  lock-when-sold guards don't 400 on no-op saves. */
export function buildTierBody(
  t: DraftTier,
  extras: {
    notifyAttendees?: boolean;
    /** Seller VAT rate for t.vatCategory in this event (null = unknown/none). */
    vatRate?: number | null;
    /**
     * Send the VAT fields. Only when the host changed them: the server
     * re-validates a VAT setting it receives, and an unrelated edit (capacity,
     * name) must never be refused because, say, the seller's VAT registration
     * lapsed since the ticket was set up.
     */
    vatChanged?: boolean;
  } = {},
): Record<string, unknown> {
  const locked = isTierLocked(t);
  const pwywMinSmallest = t.priceMode === "pwyw" && t.pwywMin.trim()
    ? toSmallestUnit(parseFloat(t.pwywMin), t.currency)
    : null;
  const installmentBody = locked
    ? {}
    : t.installmentEnabled
      ? {
          installmentTotalPrice: toSmallestUnit(parseFloat(t.installmentTotal), t.currency),
          installmentCount: parseInt(t.installmentCount, 10),
          installmentIntervalMonths: parseInt(t.installmentInterval, 10),
        }
      : {
          installmentTotalPrice: null,
          installmentCount: null,
          installmentIntervalMonths: null,
        };
  // Publish + auto-schedule. publishedAt is the source of truth:
  // null → draft; non-null ISO → published at that moment. The UI
  // toggle is just `!!publishedAt`. Auto-schedule pickers only matter
  // when the host explicitly opts in via `autoScheduleEnabled`;
  // disabled → send null for the window bounds so a previously-set
  // window doesn't keep enforcing after the host turned auto-schedule
  // off. Empty strings on the window inputs also resolve to null.
  const scheduleBody = {
    publishedAt: t.publishedAt ? new Date(t.publishedAt).toISOString() : null,
    autoScheduleEnabled: !!t.autoScheduleEnabled,
    salesStartAt: t.autoScheduleEnabled && t.salesStartAt
      ? new Date(t.salesStartAt).toISOString()
      : null,
    salesEndAt: t.autoScheduleEnabled && t.salesEndAt
      ? new Date(t.salesEndAt).toISOString()
      : null,
  };
  return {
    name: t.name.trim(),
    description: t.description.trim() || null,
    // Seller VAT: a price typed BEFORE VAT is sent as the buyer price
    // (net + VAT); the server always stores what the buyer pays.
    ...(locked ? {} : { price: buyerPriceToSend(t, extras.vatRate ?? null) ?? parseFloat(t.price), currency: t.currency }),
    ...(extras.vatChanged
      ? {
          vatCategory: t.vatCategory ?? null,
          vatPriceEntry: t.vatCategory ? (entersNet(t) ? "ADDED" : "INCLUDED") : null,
        }
      : {}),
    capacity: t.capacity ? parseInt(t.capacity, 10) : null,
    ...(locked ? {} : { priceMode: t.priceMode, pwywMinAmount: pwywMinSmallest }),
    ...installmentBody,
    ...scheduleBody,
    // isRecurring/recurringInterval are intentionally NOT sent for events.
    // Marketplace products handle recurring; events do not.
    ...(t.sourceTierId && !t.id ? { copyFormFromTierId: t.sourceTierId } : {}),
    ...(extras.notifyAttendees ? { notifyAttendees: true } : {}),
  };
}

/** Builds the donation-config sidecar body. Returns null when the
 *  draft is disabled — caller PUTs null to clear server state. */
export function buildDonationBody(
  d: DonationDraft,
  defaultCurrency: string,
): Record<string, unknown> | null {
  if (!d.enabled) return null;
  const currency = d.currency || defaultCurrency || "EUR";
  const base: Record<string, unknown> = {
    enabled: d.enabled,
    mode: d.mode,
    currency,
  };
  if (d.mode === "fixed") {
    base.amounts = d.amounts
      .map((a) => parseFloat(a))
      .filter((a) => !isNaN(a) && a > 0)
      .map((a) => toSmallestUnit(a, currency));
  } else if (d.mode === "pwyw") {
    const minRaw = d.minAmount ? parseFloat(d.minAmount) : null;
    if (minRaw != null && !isNaN(minRaw)) {
      base.minAmount = toSmallestUnit(minRaw, currency);
    }
  }
  if (d.label.trim()) base.label = d.label.trim();
  if (d.moments) base.moments = { checkout: d.moments.checkout, afterEvent: d.moments.afterEvent };
  return base;
}

/**
 * Single-arg convenience over buildDonationBody, for consumers that build the
 * /donations PUT body straight from a DonationDraft — the create-event clients
 * call this exactly like the products flow calls
 * `donationDraftToPayload(data.donation)`. Returns the sidecar object, or null
 * when donations are disabled (the caller then skips the PUT, or PUTs null to
 * clear). Uses the draft's own currency (EventForm seeds it from the tier
 * currency), falling back to EUR. Named to mirror
 * @cobuntu/product-management-ui's donationDraftToPayload so both create flows
 * read identically.
 */
export function donationDraftToPayload(d: DonationDraft): Record<string, unknown> | null {
  return buildDonationBody(d, d.currency || "EUR");
}

/** Detect tiers whose name or price changed materially vs the
 *  original snapshot. Drives the notify-attendees prompt. */
export function findTiersWithMaterialChanges(
  drafts: DraftTier[],
  snapshots: Map<string, { name: string; price: string; currency: string }>,
): DraftTier[] {
  return drafts.filter((t) => {
    if (!t.id || t.deleted) return false;
    const orig = snapshots.get(t.id);
    if (!orig) return false;
    const nameChanged = (orig.name || "").trim() !== (t.name || "").trim();
    const priceChanged = (orig.price || "") !== (t.price || "")
      || (orig.currency || "") !== (t.currency || "");
    return nameChanged || priceChanged;
  });
}

/**
 * Builds the inline `tiers` array for the CREATE-an-event payload.
 *
 * Separate from buildTierBody because the create path is a different
 * contract: EventLifecycleService takes `TierData`, which has no id to PUT
 * against and no notion of locked tiers, and which does NOT accept a sales
 * window (autoScheduleEnabled / salesStartAt / salesEndAt are update-only —
 * EventTierHelpers.createTier never writes them). Sending them would be
 * silently ignored, so they are deliberately absent here rather than passed
 * along to look supported.
 *
 * This exists so consumers stop hand-rolling the mapping. The community app's
 * CreateEventClient had its own inline version listing name/description/price/
 * currency/capacity/form, which meant a host could configure pay-what-you-want
 * or an installment plan in the modal and have it dropped on the way out —
 * even though the backend accepts both. Found 2026-08-09 auditing the create
 * payloads after the photo-upload bug.
 *
 * Mirrors draftTiersToCreatePayload in @cobuntu/product-management-ui.
 */
export function draftTiersToCreatePayload(drafts: DraftTier[]): Record<string, unknown>[] {
  return drafts
    .filter((t) => !t.deleted && t.name.trim())
    .map((t) => {
      const pwywMinSmallest =
        t.priceMode === "pwyw" && t.pwywMin?.trim()
          ? toSmallestUnit(parseFloat(t.pwywMin), t.currency)
          : null;

      const body: Record<string, unknown> = {
        name: t.name.trim(),
        description: t.description?.trim() || undefined,
        // Display units — the service converts to smallest unit itself.
        price: parseFloat(t.price) || 0,
        currency: t.currency,
        capacity: t.capacity ? parseInt(t.capacity, 10) : undefined,
        isRecurring: false,
        priceMode: t.priceMode || "fixed",
        pwywMinAmount: pwywMinSmallest,
        // Publish state from the per-tier switch. undefined leaves the
        // service default (draft); null is an explicit "keep it draft".
        publishedAt: t.publishedAt === undefined ? undefined : t.publishedAt,
      };

      if (t.installmentEnabled) {
        body.installmentTotalPrice = toSmallestUnit(parseFloat(t.installmentTotal), t.currency);
        body.installmentCount = parseInt(t.installmentCount, 10);
        body.installmentIntervalMonths = parseInt(t.installmentInterval, 10);
      }

      // Registration form staged before the event exists — written with the
      // tier in the same transaction. Omitted rather than sent empty: an
      // empty form would gate registration behind a form with no questions.
      if (t.draftForm && t.draftForm.fields?.length) body.form = t.draftForm;

      // Member (tier) pricing staged before the event exists — same rationale
      // as the form above: only the create payload can carry per-segment
      // overrides for a tier that has no id yet. The backend creates each
      // atomically with the tier. On a SAVED event these go through the
      // per-tier member-pricing endpoint instead, so this key never appears there.
      if (t.draftMemberPricing?.length) body.memberPricing = t.draftMemberPricing;

      return body;
    });
}
