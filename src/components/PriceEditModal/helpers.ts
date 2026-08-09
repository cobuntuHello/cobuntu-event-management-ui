/**
 * Pure helpers for the PriceEditModal redesign.
 *
 * Currency conversion, blank-row builders, validation. Extracted from
 * the monolithic file so the directory layout can test these in
 * isolation without mounting the whole modal.
 */

import {
  SUPPORTED_CURRENCIES,
  TIER_NAME_MAX,
  TIER_DESCRIPTION_MAX,
  type DonationDraft,
  type DraftTier,
} from "./types";

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
    name: indexHint === 1 ? "Standard" : `Tier ${indexHint}`,
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
  };
}

/** Validate one tier draft. Returns null when valid, an error message
 *  otherwise. Called per-tier in the global save loop; surfacing the
 *  first failure stops the loop. */
export function validateTier(t: DraftTier): string | null {
  if (!t.name.trim()) return "Tier name is required";
  if (t.name.length > TIER_NAME_MAX) {
    return `Tier name must be ${TIER_NAME_MAX} characters or fewer.`;
  }
  if (t.description.length > TIER_DESCRIPTION_MAX) {
    return `Description for "${t.name}" must be ${TIER_DESCRIPTION_MAX} characters or fewer.`;
  }
  if (t.price === "" || isNaN(parseFloat(t.price))) {
    return `Price required for "${t.name}"`;
  }
  if (t.priceMode === "pwyw" && t.pwywMin.trim()) {
    const min = parseFloat(t.pwywMin);
    if (isNaN(min) || min < 0) {
      return `Minimum amount for "${t.name}" must be a non-negative number.`;
    }
  }
  if (t.installmentEnabled) {
    const total = parseFloat(t.installmentTotal);
    const count = parseInt(t.installmentCount, 10);
    const interval = parseInt(t.installmentInterval, 10);
    if (isNaN(total) || total <= 0) {
      return `Installment total for "${t.name}" must be a positive number.`;
    }
    if (isNaN(count) || count < 2) {
      return `Installment count for "${t.name}" must be at least 2.`;
    }
    if (isNaN(interval) || interval < 1) {
      return `Installment interval for "${t.name}" must be at least 1 month.`;
    }
  }
  // Auto-schedule sales window. Enabling it with no bounds at all is a
  // no-op (opens-on-publish + open-ended = same as off) — block it so the
  // host doesn't think they scheduled something. When both bounds are set,
  // close must be strictly after open.
  if (t.autoScheduleEnabled) {
    if (!t.salesStartAt && !t.salesEndAt) {
      return `Set a sales-open or sales-close date for "${t.name}", or turn off auto-schedule.`;
    }
    if (t.salesStartAt && t.salesEndAt) {
      const start = new Date(t.salesStartAt).getTime();
      const end = new Date(t.salesEndAt).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
        return `Sales close must be after sales open for "${t.name}".`;
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
    if (hasBlank) return "Fill in or remove blank donation amounts.";
    const invalid = trimmed.find((a) => {
      const n = parseFloat(a);
      return isNaN(n) || n <= 0;
    });
    if (invalid !== undefined) {
      return `Donation amount "${invalid}" must be a positive number.`;
    }
    if (trimmed.length === 0) {
      return "At least one donation amount is required when fixed mode is enabled.";
    }
  }
  if (d.mode === "pwyw" && d.minAmount.trim()) {
    const n = parseFloat(d.minAmount);
    if (isNaN(n) || n < 0) {
      return "Minimum donation must be a non-negative number.";
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
  extras: { notifyAttendees?: boolean } = {},
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
    ...(locked ? {} : { price: parseFloat(t.price), currency: t.currency }),
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
  return base;
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

      return body;
    });
}
