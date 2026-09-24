"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../ui/dialog";
import { EventTimestamps } from "../ui/event-timestamps";
import { EventLocationsField, makeLocation, type EventLocationValue } from "../ui/event-locations-field";
import { EventTags } from "../ui/event-tags";
import { BannerCropModal, type BannerCropResult } from "../ui/banner-crop-modal";
import { RichTextEditor } from "../ui/rich-text-editor";
import { htmlToPlainText } from "../lib/htmlToPlainText";
import { CategoryPickerRow, type CategoryOption } from "./CategoryPickerRow";
import {
  Ticket, Lock, UserCheck, Users, Image as ImageIcon, X,
  Eye, EyeOff, Check, ChevronRight, MapPin, FileText, Tag as TagIcon,
} from "lucide-react";
import { PriceEditModal } from "./PriceEditModal";
import type { DraftTier, DonationDraft } from "./PriceEditModal/types";
import type { MemberPricingUpsert } from "./PriceEditModal/member-pricing";
import { blankTier, blankDonation } from "./PriceEditModal/helpers";
import { DonationsField } from "./PriceEditModal/DonationsField";
// `useStripeStatus` / `StripeRequiredWarning` deliberately not imported — see
// openTierModal for why configuring a price is the wrong moment to check a
// payment account. stripe-status.tsx itself stays: other surfaces use it.
import {
  MembershipTierPicker,
  toTierAccessValue,
  fromTierAccessValue,
  tierAccessSummary,
  ceilingFor,
  clampToCeiling,
  tierAccessConsequence,
  type TierAccessValue,
  type MembershipTier,
} from "@cobuntu/management-ui-shared";

// ─── Currencies ────────────────────────────────────────────────

const SUPPORTED_CURRENCIES = [
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺" },
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸" },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", flag: "🇧🇷" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", flag: "🇨🇭" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$", flag: "🇨🇦" },
  { code: "AUD", name: "Australian Dollar", symbol: "$", flag: "🇦🇺" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
];

function getCurrencySymbol(code: string): string {
  return SUPPORTED_CURRENCIES.find(c => c.code === code)?.symbol || code;
}

function formatPrice(amount: number, currency: string): string {
  return `${getCurrencySymbol(currency)}${amount.toFixed(2)}`;
}

// ─── Types ─────────────────────────────────────────────────────

interface Tag { id: string; name: string; }

export interface TierItem {
  localId: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  capacity: string;
  isRecurring: boolean;
  recurringInterval: "monthly" | "yearly";
  /**
   * Registration form staged in the tier modal before the event exists.
   * Carried on TierItem purely so it survives the DraftTier -> TierItem
   * round-trip below; the consumer forwards it on the create payload and the
   * backend writes it with the tier. Undefined for a tier with no form.
   */
  draftForm?: { fields: any[]; stepLabels?: string[] } | null;
  /**
   * Community member (tier) pricing staged in the tier modal before the event
   * exists. Same reason as draftForm: this interface is a field allowlist in
   * BOTH directions, so a field not named here is dropped on every modal close.
   * Carried here so the per-segment overrides survive the DraftTier ->
   * TierItem round-trip and reach the create payload (draftTiersToCreatePayload
   * emits body.memberPricing). Undefined for a tier with no overrides.
   */
  draftMemberPricing?: MemberPricingUpsert[] | null;
  /**
   * Publish state, staged before the event exists. Same reason as draftForm:
   * this interface is a field allowlist, so a field not named here is dropped
   * on every modal close — which is what silently reset every tier to
   * published before the row toggle existed.
   */
  publishedAt?: string | null;
  /**
   * Pricing model + plan + sales window.
   *
   * All of these are configurable in the tier modal (BasicsStep offers
   * pay-what-you-want and an installment plan; ConfigStep offers a sales
   * window) and all of them are accepted by the backend's TierData on inline
   * event-tier create. They were simply not named on this interface, which is
   * a field allowlist in BOTH directions — so a host could set up PWYW or an
   * installment plan, watch the modal show it back correctly, and have the
   * whole thing vanish the moment the modal closed. Found 2026-08-09 while
   * auditing the create payloads after the photo-upload bug.
   */
  priceMode?: "fixed" | "pwyw";
  pwywMin?: string;
  installmentEnabled?: boolean;
  installmentTotal?: string;
  installmentCount?: string;
  installmentInterval?: string;
  autoScheduleEnabled?: boolean;
  salesStartAt?: string;
  salesEndAt?: string;
}

/**
 * Who may see an event's attendee roster. Mirrors the backend enum
 * `AttendeeVisibility`; the gate is enforced there, not here.
 */
export type AttendeeVisibility = "PUBLIC" | "ATTENDEES_ONLY" | "COUNT_ONLY" | "HIDDEN";

/** The four choices, in the order the picker offers them: most open first. */
export const ATTENDEE_VISIBILITY_OPTIONS: {
  value: AttendeeVisibility; label: string; hint: string;
}[] = [
  { value: "PUBLIC", label: "Everyone", hint: "Anyone who can see the event sees who is going" },
  { value: "ATTENDEES_ONLY", label: "Attendees only", hint: "The list appears once someone has a ticket" },
  { value: "COUNT_ONLY", label: "Just the number", hint: "How many are going, but no names or faces" },
  { value: "HIDDEN", label: "Nobody", hint: "No list and no number" },
];

/**
 * Who may see an event's PHYSICAL location. Mirrors the backend enum
 * `LocationVisibility`; the gate is enforced there, not here. The online
 * meeting link is a separate, always-attendee-only rule and is NOT covered by
 * this control.
 */
export type LocationVisibility = "PUBLIC" | "ATTENDEES_ONLY";

/** The two choices, most open first. */
export const LOCATION_VISIBILITY_OPTIONS: {
  value: LocationVisibility; label: string; hint: string;
}[] = [
  { value: "PUBLIC", label: "Everyone", hint: "Anyone who can see the event sees the address" },
  { value: "ATTENDEES_ONLY", label: "Attendees only", hint: "The address appears once someone has a ticket" },
];

/** One location as sent to the server (Phase 2). Mirrors backend EventLocationInput. */
export interface EventLocationPayload {
  kind: "PHYSICAL" | "ONLINE";
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  url?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface EventFormData {
  name: string;
  description: string;
  /** Community taxonomy. null = unfiled. Sub-category is only ever set with its parent. */
  categoryId: string | null;
  subCategoryId: string | null;
  bannerUrl: string;
  startDate: Date | null;
  endDate: Date | null;
  startTime: string;
  endTime: string;
  timezone: string;
  physicalLocation: string;
  onlineUrl: string;
  /**
   * The map pin for `physicalLocation`, when the host picked the address from
   * the Google suggestion list rather than typing it.
   *
   * Optional on the type so consumers written before this shipped still
   * type-check (same reason as `viewability` below). null means "no pin":
   * either nothing was picked, or the host hand-edited the address afterwards,
   * in which case the old pin is deliberately dropped rather than left to
   * disagree with the text.
   *
   * These were silently discarded on create until 2026-09-16 — the form
   * rendered EventLocationSelector without `onCoordinatesChange`, and the
   * selector calls it optionally, so every resolved pin went on the floor and
   * the detail page fell back to "Location to be announced".
   */
  physicalLatitude?: number | null;
  physicalLongitude?: number | null;
  /**
   * Phase 2 event-locations: the full set of locations. When present it is the
   * source of truth on the server; the flat fields above mirror its PRIMARY
   * row for back-compat. Optional so consumers from before Phase 2 type-check
   * (they keep sending just the flat fields, which the server still accepts).
   */
  locations?: EventLocationPayload[];
  // Action gate — who can RSVP (existing field, "Attendance" toggle below).
  accessibility: "PUBLIC" | "MEMBERS_ONLY";
  // View gate — who can SEE the event detail page (new, PR 8 of
  // feat/visibility-overrides). Optional on the type so callers from
  // before the rollout still type-check; the form defaults it to
  // "PUBLIC" if not provided.
  viewability?: "PUBLIC" | "MEMBERS_ONLY";
  requiresApproval: boolean;
  /**
   * Who may see the attendee roster on the customer-facing portal.
   *
   * Optional on the type so consumers written before this shipped still
   * type-check (same reason as `viewability`). Omitted means the server's
   * column default, PUBLIC, which is what every event did before this existed.
   *
   * The gate itself is SERVER-side (transformEvent + the v1 public API); this
   * field only carries the host's choice to the create/update payload. It has
   * no effect in the admin app or on /manage, which always ask for the roster
   * as management. See docs/features/attendee-visibility.md in the backend.
   */
  attendeeVisibility?: AttendeeVisibility;
  /**
   * Who may see the PHYSICAL location on the customer-facing portal.
   *
   * Optional on the type (same back-compat reason as `viewability` /
   * `attendeeVisibility`). Omitted means the server's column default, PUBLIC —
   * the address stays public, as every event did before this existed.
   *
   * Gate is SERVER-side (transformEvent + the v1 public API); this only
   * carries the host's choice. The online link is always attendee-only and is
   * not affected by this. See docs/features/event-locations-p1.md in the backend.
   */
  locationVisibility?: LocationVisibility;
  /**
   * Membership tiers granted view / register access.
   *
   * EMPTY means "every tier", not "nobody" - the same rule the backend applies
   * (no rows means unrestricted). Consumers send these alongside viewability /
   * accessibility; the pair is the whole answer.
   */
  viewTierIds: string[];
  buyTierIds: string[];
  tiers: TierItem[];
  /**
   * Event-level donation sidecar (independent of tiers). Optional on the type
   * so consumers written before donations shipped still type-check. The
   * create flow does NOT accept a donationConfig inline (unlike products); the
   * consumer sends this to `PUT /communities/:tag/events/:eventId/donations`
   * after the event is created via `donationDraftToPayload(donation)`, which
   * returns null when donations are disabled. Mirrors ProductForm.donation.
   */
  donation?: DonationDraft;
  tags: Tag[];
}

interface EventFormProps {
  communityTag: string;
  /**
   * The community's EVENT categories, loaded by the CONSUMER.
   *
   * Not fetched here: this form runs the create wizard without a configured
   * API base, so a fetch would quietly break embedding. The row hides itself
   * when empty, so a community with no taxonomy sees no picker rather than an
   * empty one. Mirrors ProductForm.
   */
  categories?: CategoryOption[];
  initialData?: Partial<EventFormData>;
  onChange?: (data: EventFormData) => void;
  showErrors?: boolean;
  ownership?: "community" | "personal" | null;
  onOwnershipChange?: (v: "community" | "personal") => void;
  communityName?: string;
  communityIcon?: string | null;
  userName?: string;
  userAvatar?: string | null;
  /**
   * When true, the built-in Visibility + Attendance rows (viewability +
   * accessibility — the members-only community gates) are NOT rendered. Used
   * by the community-app create flow for MEMBER submissions: a member can't
   * set members-only gating (that's a community-leader capability), so the
   * consumer hides the controls and the form emits its default PUBLIC/PUBLIC.
   * Leaders creating in-context pass `false` and configure them inline.
   * Mirrors ProductForm's `hideVisibility`. The backend independently clamps
   * member submissions to PUBLIC, so this is a UI affordance, not the guard.
   */
  hideVisibility?: boolean;
  /**
   * The community's membership tiers, for the access picker. Passed in rather
   * than fetched: the form makes no API calls of its own during create, and an
   * empty list simply renders "no membership tiers yet".
   */
  membershipTiers?: MembershipTier[];
  /** Tier ids currently granted view / register access, from the listing. */
  initialViewTierIds?: string[];
  initialBuyTierIds?: string[];
  /**
   * Tailwind max-width class applied to both content sections (name/banner/
   * schedule, and the Event Options card below it). Defaults to `max-w-3xl`
   * — the form's original fixed width, kept as the default so existing
   * consumers embedding this in a wider page shell (which was relying on
   * the form self-narrowing) don't change. A consumer whose OWN page
   * wrapper already caps the available width (e.g. a `max-w-[1080px]`
   * page shell) can pass `"max-w-none"` here to let the form fill that
   * width instead of narrowing further on top of it.
   */
  maxWidthClassName?: string;
  /**
   * Which half of the form to render, so a wizard can put pricing + approval on
   * their own step. Mirrors ProductForm's `page`:
   *   - "listing"  → the event's own details: name, banner, schedule, location,
   *                  description, tags, category, CTA.
   *   - "commerce" → ticket tiers (pricing) and the host's Require-approval gate.
   *   - "all" (default) → everything on one page, so the manage/edit drawer and
   *                  any single-page consumer are byte-identical to before.
   * The state is shared regardless of page, so a wizard can mount ONE form and
   * flip `page` between steps without losing what was typed. Community access
   * (visibility) is unaffected — it stays gated by `hideVisibility` and, in the
   * wizard, lives on its own access step.
   */
  page?: "listing" | "commerce" | "all";
  /**
   * Surfaces community member (tier) pricing inside the draftMode tier wizard
   * so per-segment discount overrides can be configured at CREATE time (they
   * ride the create payload, created atomically with each tier). Community-
   * owned events only — the consumer passes its own ownership signal
   * (e.g. `ownership === "community"`). Off → the section is not rendered,
   * matching a member creating their own event. Default false. Mirrors
   * ProductForm's `showMemberPricing`.
   */
  showMemberPricing?: boolean;
}

// ─── Component ─────────────────────────────────────────────────

export function EventForm({ communityTag, initialData, onChange, showErrors, ownership, onOwnershipChange, communityName, communityIcon, userName, userAvatar, hideVisibility, categories, membershipTiers = [], initialViewTierIds, initialBuyTierIds, maxWidthClassName = "max-w-3xl", page = "all", showMemberPricing = false }: EventFormProps) {
  // Which half of the form this render shows. Default "all" → both true, so the
  // one-page consumers (manage/edit drawer, admin single-page) are unchanged.
  const showListing = page !== "commerce";
  const showCommerce = page !== "listing";
  // Form state
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  // Collapsed-row preview. htmlToPlainText, not an inline tag-strip: the rich
  // text editor emits &nbsp; for runs of spaces, and stripping tags alone left
  // those entities to render literally as "Two&nbsp;communities". Same helper
  // EditEventDrawer already uses, so the create and edit rows agree.
  const descriptionPreview = htmlToPlainText(description);
  const [bannerUrl, setBannerUrl] = useState(initialData?.bannerUrl || "");
  const [startDate, setStartDate] = useState<Date | null>(initialData?.startDate || null);
  const [endDate, setEndDate] = useState<Date | null>(initialData?.endDate || null);
  const [startTime, setStartTime] = useState(initialData?.startTime || "15:00");
  const [endTime, setEndTime] = useState(initialData?.endTime || "16:00");
  const [timezone, setTimezone] = useState(initialData?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [physicalLocation, setPhysicalLocation] = useState(initialData?.physicalLocation || "");
  const [physicalLatitude, setPhysicalLatitude] = useState<number | null>(initialData?.physicalLatitude ?? null);
  const [physicalLongitude, setPhysicalLongitude] = useState<number | null>(initialData?.physicalLongitude ?? null);
  const [onlineUrl, setOnlineUrl] = useState(initialData?.onlineUrl || "");
  // Phase 2: the repeatable location set. Seeded from initialData.locations when
  // present, else synthesized from the legacy flat fields so an event created
  // before Phase 2 opens with its single location already in the list.
  const [locations, setLocations] = useState<EventLocationValue[]>(() => {
    const seed = initialData?.locations;
    if (seed && seed.length) {
      return seed.map((l, i) => ({
        key: `seed-${i}`,
        kind: l.kind,
        address: l.address || "",
        latitude: l.latitude ?? null,
        longitude: l.longitude ?? null,
        url: l.url || "",
        isPrimary: !!l.isPrimary,
      }));
    }
    const rows: EventLocationValue[] = [];
    if ((initialData?.physicalLocation || "").trim() || (initialData?.physicalLatitude != null && initialData?.physicalLongitude != null)) {
      const p = makeLocation("PHYSICAL", true);
      rows.push({ ...p, address: initialData?.physicalLocation || "", latitude: initialData?.physicalLatitude ?? null, longitude: initialData?.physicalLongitude ?? null });
    }
    if ((initialData?.onlineUrl || "").trim()) {
      const o = makeLocation("ONLINE", rows.length === 0);
      rows.push({ ...o, url: initialData?.onlineUrl || "" });
    }
    return rows;
  });

  // The wire shape of `locations`: drop empty rows, stamp sortOrder, and only
  // carry the field each kind actually uses. This is what the server persists.
  const locationsPayload = useMemo<EventLocationPayload[]>(() => locations
    .map((l, i): EventLocationPayload => ({
      kind: l.kind,
      address: l.kind === "PHYSICAL" ? (l.address.trim() || null) : null,
      latitude: l.kind === "PHYSICAL" ? l.latitude : null,
      longitude: l.kind === "PHYSICAL" ? l.longitude : null,
      url: l.kind === "ONLINE" ? (l.url.trim() || null) : null,
      isPrimary: l.isPrimary,
      sortOrder: i,
    }))
    .filter((l) => l.kind === "PHYSICAL" ? (!!l.address || (l.latitude != null && l.longitude != null)) : !!l.url),
    [locations]);

  // Keep the legacy flat fields (physicalLocation/…/onlineUrl) mirroring the
  // primary — the first physical + first online — so every existing consumer of
  // this form (summary, back-compat payload) keeps working unchanged while
  // `locations` is the real source of truth.
  const primaryPhysical = locationsPayload.find((l) => l.kind === "PHYSICAL");
  const primaryOnline = locationsPayload.find((l) => l.kind === "ONLINE");
  useEffect(() => {
    setPhysicalLocation(primaryPhysical?.address || "");
    setPhysicalLatitude(primaryPhysical?.latitude ?? null);
    setPhysicalLongitude(primaryPhysical?.longitude ?? null);
    setOnlineUrl(primaryOnline?.url || "");
  }, [primaryPhysical?.address, primaryPhysical?.latitude, primaryPhysical?.longitude, primaryOnline?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Capacity is now per-tier (set inside the tier modal). Legacy event-level
  // capacity field was removed in the tier-only capacity refactor (PR C).
  const [accessibility, setAccessibility] = useState<"PUBLIC" | "MEMBERS_ONLY">(initialData?.accessibility || "PUBLIC");
  const [viewability, setViewability] = useState<"PUBLIC" | "MEMBERS_ONLY">(initialData?.viewability || "PUBLIC");
  /*
   * The picker's own shape. `MEMBERS_ONLY` with no granted tiers reads as
   * "all members", never as an empty selection - that is the no-backfill rule
   * surfacing in the UI, and it is why every event that predates this opens
   * as All members rather than as a picker with nothing ticked.
   */
  const [viewAccess, setViewAccess] = useState<TierAccessValue>(
    toTierAccessValue(initialData?.viewability ?? "PUBLIC", initialViewTierIds),
  );
  const [buyAccess, setBuyAccess] = useState<TierAccessValue>(
    toTierAccessValue(initialData?.accessibility ?? "PUBLIC", initialBuyTierIds),
  );
  const [requiresApproval, setRequiresApproval] = useState(initialData?.requiresApproval || false);
  // PUBLIC unless told otherwise — the server column defaults the same way, so
  // a form that never touches this reproduces today's behaviour exactly.
  const [attendeeVisibilityOpen, setAttendeeVisibilityOpen] = useState(false);
  const [attendeeVisibility, setAttendeeVisibility] = useState<AttendeeVisibility>(
    initialData?.attendeeVisibility || "PUBLIC",
  );
  // Who can see the physical address. PUBLIC unless told otherwise — matches
  // the server column default, so an untouched form reproduces today's behaviour.
  const [locationVisibilityOpen, setLocationVisibilityOpen] = useState(false);
  const [locationVisibility, setLocationVisibility] = useState<LocationVisibility>(
    initialData?.locationVisibility || "PUBLIC",
  );
  /**
   * The default "Standard" ticket tier.
   *
   * ProductForm seeds one of these; this form used to start empty, so a host
   * creating a free event saw "Free event" and no row at all — and since
   * capacity and registration forms are BOTH per-tier (event-level capacity
   * was removed in the tier-only refactor above), there was nowhere to set
   * either one. A free event with limited spots or an application form was
   * simply unreachable from here.
   *
   * Published by default so that a host who does configure it can actually
   * list the event — EventListingService refuses to list an event whose tiers
   * are all draft.
   */
  const standardTier = (): TierItem => ({
    localId: crypto.randomUUID(),
    name: "Standard",
    // "0", not "" — deliberately one step better than ProductForm's seed.
    // validateTier rejects an empty price, so a blank seed makes Save fail
    // with "Price required for Standard" the moment a host adds a SECOND
    // tier, which is a dead end they did nothing to cause. "0" renders
    // identically ("Free": both fail the price > 0 test) and saves cleanly.
    description: "", price: "0", currency: "EUR", capacity: "",
    isRecurring: false, recurringInterval: "monthly",
    publishedAt: new Date().toISOString(),
  });

  const [tiers, setTiers] = useState<TierItem[]>(
    initialData?.tiers && initialData.tiers.length > 0 ? initialData.tiers : [standardTier()],
  );
  const [tags, setTags] = useState<Tag[]>(initialData?.tags || []);
  /**
   * Event-level donation sidecar. Seeded from initialData when present (an
   * edit / resumed draft), otherwise a blank draft in the seed tier's
   * currency. Mirrors ProductForm's `donation` state. The create flow sends it
   * via a post-create PUT /donations (create does not accept it inline), so
   * this is emitted on every onChange for the consumer to forward.
   */
  const [donation, setDonation] = useState<DonationDraft>(
    initialData?.donation || blankDonation(initialData?.tiers?.[0]?.currency || "EUR"),
  );
  const [categoryId, setCategoryId] = useState<string | null>(initialData?.categoryId ?? null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(initialData?.subCategoryId ?? null);

  // UI state
  const [isBannerCropOpen, setIsBannerCropOpen] = useState(false);
  // Inline banner upload — tap the banner → native device picker (our own
  // hidden input) → the square cropper (the only popup) → the banner is set.
  // No upload/stock "options" popup. bannerCropSrc feeds the cropper directly.
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const [bannerCropSrc, setBannerCropSrc] = useState<string | null>(null);
  function pickBanner() { bannerInputRef.current?.click(); }
  function onBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (bannerInputRef.current) bannerInputRef.current.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setBannerCropSrc(reader.result as string); setIsBannerCropOpen(true); };
    reader.readAsDataURL(file);
  }
  function recropBanner() { if (!bannerUrl) return; setBannerCropSrc(bannerUrl); setIsBannerCropOpen(true); }
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [showTierModal, setShowTierModal] = useState(false);
  // Which tier the modal opens on. The tier LIST lives inline in this form now,
  // so the modal jumps straight to the per-tier edit screen.
  const [editTierLocalId, setEditTierLocalId] = useState<string | undefined>(undefined);
  // NO Stripe gate on opening the tier editor — deliberately. See the long
  // comment on openTierModal below.

  // Convert the parent's flat TierItem shape into the PriceEditModal's
  // DraftTier shape on modal open. The events PriceEditModal doesn't
  // surface isRecurring (events checkout runs Stripe in payment mode,
  // not subscription); we drop those fields here and they reset to
  // false on round-trip — matching the events package's design.
  function tiersToDrafts(items: TierItem[]): DraftTier[] {
    if (items.length === 0) return [blankTier()];
    return items.map((t) => ({
      ...blankTier(t.currency || "EUR", 1),
      localId: t.localId,
      name: t.name,
      description: t.description,
      price: t.price,
      currency: t.currency,
      capacity: t.capacity,
      // Seed the staged form back so reopening the modal shows the questions
      // already added, rather than an empty builder that silently replaces
      // them on the next commit.
      draftForm: t.draftForm ?? null,
      // Same for member pricing — reopening the modal must show the overrides
      // the host already configured (the seeding effect builds rows from this).
      draftMemberPricing: t.draftMemberPricing ?? null,
      // Carried explicitly (allowlist — see TierItem.publishedAt). Only
      // overrides when the consumer actually set it: blankTier above defaults
      // publishedAt to "now", and defaulting undefined to null here would
      // silently unpublish every tier of a consumer that never sets the field.
      ...(t.publishedAt !== undefined ? { publishedAt: t.publishedAt } : {}),
      // Same allowlist caveat as publishedAt: only override when the caller
      // actually set it, so blankTier's defaults stand otherwise.
      ...(t.priceMode !== undefined ? { priceMode: t.priceMode } : {}),
      ...(t.pwywMin !== undefined ? { pwywMin: t.pwywMin } : {}),
      ...(t.installmentEnabled !== undefined ? { installmentEnabled: t.installmentEnabled } : {}),
      ...(t.installmentTotal !== undefined ? { installmentTotal: t.installmentTotal } : {}),
      ...(t.installmentCount !== undefined ? { installmentCount: t.installmentCount } : {}),
      ...(t.installmentInterval !== undefined ? { installmentInterval: t.installmentInterval } : {}),
      ...(t.autoScheduleEnabled !== undefined ? { autoScheduleEnabled: t.autoScheduleEnabled } : {}),
      ...(t.salesStartAt !== undefined ? { salesStartAt: t.salesStartAt } : {}),
      ...(t.salesEndAt !== undefined ? { salesEndAt: t.salesEndAt } : {}),
    }));
  }

  /**
   * Opens the tier editor UNCONDITIONALLY. There used to be a Stripe gate
   * here, and it was the most obstructive version of a mistake this codebase
   * has now removed in three places:
   *
   *   - It blocked OPENING the editor at all, so a host could not so much as
   *     LOOK at tiers they had already configured, let alone fix a price.
   *   - It tested the COMMUNITY's account, while the warning it raised offers
   *     a link to the USER's payouts onboarding — following it could never
   *     clear the block.
   *   - The status endpoint behind it is gated on ACCESS_ADMIN_APP and the
   *     hook maps ANY failure to not-ready, so for a non-admin host a 403 was
   *     indistinguishable from a genuinely unconnected community.
   *
   * Configuring a price is not when money moves. The account is needed only
   * when the event becomes BUYABLE, and the server enforces that at listing
   * time, where the applicable commission rate is actually known.
   */
  function openTierModal() {
    setShowTierModal(true);
  }

  /** Open the per-tier edit screen for an existing tier (edit) or a freshly
   *  appended blank tier (add). Ungated, per openTierModal above. */
  function openTierEditor(localId: string) {
    setEditTierLocalId(localId);
    setShowTierModal(true);
  }
  /**
   * A tier being added but not yet committed.
   *
   * It is NOT written into `tiers` up front. It used to be — addAndEditTier
   * appended a blank TierItem and then opened the modal — and since the
   * modal's direct-open footer says "Cancel" and only calls onClose(), backing
   * out left the tier behind. Its name was "" so it surfaced as "Unnamed
   * tier"; cancelling three times produced three of them. Reported 2026-08-09
   * as "opening/closing the modal creates a new tier".
   *
   * handleTiersCommit is now the only thing that writes `tiers`.
   */
  const [pendingNewTier, setPendingNewTier] = useState<TierItem | null>(null);

  function addAndEditTier() {
    // Named by position rather than left blank, so a second tier reads
    // "Tier 2" instead of another "Unnamed tier" (matches products).
    const live = tiers.filter((t) => t.name.trim()).length;
    const nt: TierItem = {
      localId: crypto.randomUUID(),
      name: live === 0 ? "Standard" : `Tier ${live + 1}`,
      description: "", price: "", currency: "EUR",
      capacity: "", isRecurring: false, recurringInterval: "monthly",
      publishedAt: new Date().toISOString(),
    };
    setPendingNewTier(nt);
    openTierEditor(nt.localId);
  }

  /** Shared by every path that closes the modal — commit or not. */
  function closeTierModal() {
    setShowTierModal(false);
    setPendingNewTier(null);
    setEditTierLocalId(undefined);
  }

  function handleTiersCommit({ tiers: drafts }: { tiers: DraftTier[]; donation: DonationDraft }) {
    // Round-trip DraftTier[] → TierItem[]. localId is preserved so the
    // list re-renders stably; new tiers get a fresh uuid from the modal.
    setTiers(
      drafts.map((d) => ({
        localId: d.localId || crypto.randomUUID(),
        name: d.name,
        description: d.description,
        price: d.price,
        currency: d.currency,
        capacity: d.capacity,
        // Carried explicitly: this mapping is a field allowlist, so anything
        // not named here is dropped silently on every modal close.
        draftForm: d.draftForm ?? null,
        // The folded member pricing (Save writes it onto the draft) — carried
        // so it reaches EventFormData.tiers and the create payload.
        draftMemberPricing: d.draftMemberPricing ?? null,
        publishedAt: d.publishedAt ?? null,
        // Carried explicitly — see TierItem. Omitting any of these silently
        // reverted the host's pricing model, plan or sales window on close.
        priceMode: d.priceMode,
        pwywMin: d.pwywMin,
        installmentEnabled: d.installmentEnabled,
        installmentTotal: d.installmentTotal,
        installmentCount: d.installmentCount,
        installmentInterval: d.installmentInterval,
        autoScheduleEnabled: d.autoScheduleEnabled,
        salesStartAt: d.salesStartAt,
        salesEndAt: d.salesEndAt,
        // Recurring fields aren't surfaced by the events PriceEditModal
        // (events don't support subscription tiers); reset to defaults.
        isRecurring: false,
        recurringInterval: "monthly",
      })),
    );
    closeTierModal();
  }
  const [ownershipOpen, setOwnershipOpen] = useState(false);

  // Validation
  const [formErrors] = useState<Record<string, string>>({});

  // Initialize dates
  useEffect(() => {
    if (!initialData?.startDate && !startDate) {
      const now = new Date();
      setStartDate(now);
      setEndDate(now);
      const mins = now.getMinutes();
      const rounded = Math.ceil(mins / 30) * 30;
      const next = new Date(now);
      next.setMinutes(rounded >= 60 ? 0 : rounded);
      if (rounded >= 60) next.setHours(next.getHours() + 1);
      next.setSeconds(0);
      setStartTime(next.toTimeString().slice(0, 5));
      const end = new Date(next);
      end.setHours(end.getHours() + 1);
      setEndTime(end.toTimeString().slice(0, 5));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * One translation, used by both the payload and the icons, so they cannot
   * drift: the picker's three modes collapse to an enum plus a tier list.
   */
  const viewResolved = fromTierAccessValue(viewAccess);
  const buyResolved = fromTierAccessValue(buyAccess);
  /*
   * ── Buying is a subset of seeing ──────────────────────────────────
   *
   * These were two independent pieces of state, so "visible to Founding
   * only" plus "anyone can buy it" was reachable and saveable. Not a hole -
   * the view gate runs first, so a non-member never reaches the buy button -
   * but the card asserted something untrue, and whoever set it believed they
   * had opened sales to the public.
   *
   * The buy picker is handed a ceiling instead of being validated after the
   * fact: an option the view setting excludes is never offered. Narrowing
   * view drags buy back with it, which is why view goes through a setter
   * rather than being set directly.
   */
  const buyCeiling = ceilingFor(viewAccess);
  const changeViewAccess = (next: TierAccessValue) => {
    setViewAccess(next);
    setBuyAccess((prev) => clampToCeiling(prev, ceilingFor(next)));
  };

  // Notify parent — use useLayoutEffect to ensure data is synced before unmount
  /**
   * What actually gets submitted.
   *
   * The seeded "Standard" tier is an ENTRY POINT, not a decision: a host who
   * never opens it wanted a plain free event, and creating a ticket tier for
   * them would move the event off the tier-less RSVP path (attendances would
   * start carrying a tierId). So an untouched seed is dropped and the event
   * submits with no tiers — the same end state as before this row existed,
   * and the same end state ProductForm produces for its own untouched seed.
   *
   * "Touched" is deliberately wider than "charges money", which is the test
   * ProductForm uses. Products drops a free tier even when it carries a
   * capacity or a registration form, silently discarding both. Events can
   * already ship a named free tier and that is worth keeping, so anything the
   * host actually configured counts.
   */
  const submittableTiers = useMemo(() => tiers.filter((t) => {
    const charges = !!t.price && parseFloat(t.price) > 0;
    const configured = !!t.capacity || !!t.draftForm?.fields?.length;
    const renamed = t.name.trim() !== "" && t.name.trim() !== "Standard";
    return charges || configured || renamed;
  // Memoised so the emit effect below has a stable dependency. Without it the
  // effect fires on every render and the consumer's onChange runs each time
  // (CreateEventClient setStates from it — React bails on an unchanged value,
  // but relying on that bail-out for correctness is not worth it).
  }), [tiers]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useLayoutEffect(() => {
    onChangeRef.current?.({
      name, description, bannerUrl, startDate, endDate, startTime, endTime, timezone,
      physicalLocation, physicalLatitude, physicalLongitude, onlineUrl,
      // Phase 2: the full set. The flat fields above stay as the primary mirror.
      locations: locationsPayload,
      /*
       * `submittableTiers` (main #111/#112), not raw `tiers`: the raw list
       * includes rows the host has not configured, and emitting those dropped
       * pay-what-you-want and installment plans on create.
       *
       * categoryId / subCategoryId ride alongside — they are listing
       * properties, not tier properties, so they sit outside the tier list.
       */
      /*
       * The picker is the source of truth for both access axes now. It owns
       * one list where the stored shape is two things - an enum plus grant
       * rows - so the enum is DERIVED here rather than tracked separately,
       * which is what stops the summary and the rows disagreeing.
       */
      accessibility: buyResolved.visibility,
      viewability: viewResolved.visibility,
      viewTierIds: viewResolved.tierIds,
      buyTierIds: buyResolved.tierIds,
      requiresApproval, attendeeVisibility, locationVisibility, tiers: submittableTiers, tags,
      categoryId, subCategoryId,
      /*
       * Donation sidecar — emitted so the create clients can PUT it to
       * /donations after the event is created (create takes no inline
       * donationConfig). Always present; disabled donations collapse to null
       * via donationDraftToPayload on the consumer side. Mirrors ProductForm.
       */
      donation,
    });
  }, [name, description, bannerUrl, startDate, endDate, startTime, endTime, timezone,
      physicalLocation, physicalLatitude, physicalLongitude, onlineUrl, locationsPayload,
      viewAccess, buyAccess, requiresApproval, attendeeVisibility, locationVisibility, submittableTiers, tags,
      categoryId, subCategoryId, donation]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAttendeeOption = ATTENDEE_VISIBILITY_OPTIONS.find(o => o.value === attendeeVisibility);
  const selectedLocationOption = LOCATION_VISIBILITY_OPTIONS.find(o => o.value === locationVisibility);
  const hasLocation = locationsPayload.length > 0;
  // Summary line under the "Location" row: the primary, plus a "+N more" when
  // the event carries several locations.
  const locationSummary = (() => {
    if (locationsPayload.length === 0) return "";
    const primary = locationsPayload.find((l) => l.isPrimary) || locationsPayload[0];
    const primaryLabel = primary.kind === "PHYSICAL" ? (primary.address || "In person") : "Online";
    const extra = locationsPayload.length - 1;
    return extra > 0 ? `${primaryLabel} · +${extra} more` : primaryLabel;
  })();

  return (
    <div>
      {/* ─── LISTING — the event's own details (title, banner, schedule,
            location, description, tags, category). Hidden on the wizard's
            pricing step (page="commerce"); shown alone on page="listing". ─── */}
      {showListing && (
      <div className={`space-y-5 ${maxWidthClassName}`}>
          {/* Ownership selector */}
          {ownership && onOwnershipChange && (
            <div className="relative inline-block">
              <button type="button" onClick={() => setOwnershipOpen(!ownershipOpen)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200/70 transition-colors cursor-pointer text-[13px] text-zinc-700">
                {ownership === "community" ? (
                  communityIcon ? <img src={communityIcon} alt="" className="w-4 h-4 rounded object-cover" /> : <div className="w-4 h-4 rounded bg-zinc-300 flex items-center justify-center text-[8px] font-bold text-white">{communityName?.[0]}</div>
                ) : (
                  userAvatar ? <img src={userAvatar} alt="" className="w-4 h-4 rounded-full object-cover" /> : <div className="w-4 h-4 rounded-full bg-zinc-300 flex items-center justify-center text-[8px] font-bold text-white">{userName?.[0]}</div>
                )}
                <span><span className="text-zinc-400">Owned by </span><span className="font-medium">{ownership === "community" ? communityName : userName}</span></span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-400"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {ownershipOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOwnershipOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg ring-1 ring-zinc-200 py-1 min-w-[240px]">
                    <button type="button" onClick={() => { onOwnershipChange("community"); setOwnershipOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50 cursor-pointer">
                      {communityIcon ? <img src={communityIcon} alt="" className="w-6 h-6 rounded object-cover" /> : <div className="w-6 h-6 rounded bg-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-500">{communityName?.[0]}</div>}
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-zinc-800">{communityName}</p>
                        <p className="text-[11px] text-zinc-400">Community event</p>
                      </div>
                      {ownership === "community" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                    <button type="button" onClick={() => { onOwnershipChange("personal"); setOwnershipOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50 cursor-pointer">
                      {userAvatar ? <img src={userAvatar} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-500">{userName?.[0]}</div>}
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-zinc-800">{userName}</p>
                        <p className="text-[11px] text-zinc-400">Personal event</p>
                      </div>
                      {ownership === "personal" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Event name */}
          <div>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Event Name"
              className="w-full text-[28px] font-bold text-zinc-900 placeholder:text-zinc-300 bg-transparent border-none outline-none p-0 leading-tight" />
            {showErrors && !name.trim() && (
              <p className="text-[13px] text-amber-600 mt-2 flex items-center gap-1.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="shrink-0"><path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 16h2v2h-2zm0-6h2v4h-2z" /></svg>
                Give your event a name
              </p>
            )}
          </div>

          {/* Banner — single square (1:1) cover. Tap it → device photo picker
              → square cropper (the only popup) → it lands here. Tap again to
              recrop, the corner X to remove. Responsive: full-width up to
              360px. No gallery/options popup. */}
          {bannerUrl ? (
            <div className="group relative w-full max-w-[360px] aspect-square rounded-2xl overflow-hidden ring-1 ring-zinc-100">
              <button type="button" onClick={recropBanner} className="block w-full h-full cursor-pointer" aria-label="Recrop banner">
                <img src={bannerUrl} alt="Event banner" className="w-full h-full object-cover" />
                <span className="absolute top-3 left-3 text-[11px] font-semibold tracking-wide bg-white/85 backdrop-blur-sm text-zinc-800 px-2.5 py-1 rounded-full">Cover</span>
                <span className="absolute inset-0 flex items-center justify-center gap-2 bg-black/25 text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  <ImageIcon className="h-[18px] w-[18px]" /> Recrop
                </span>
              </button>
              <button type="button" onClick={() => setBannerUrl("")} aria-label="Remove banner"
                className="absolute top-2.5 right-2.5 h-7 w-7 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={pickBanner}
              className="group relative w-full max-w-[360px] aspect-square rounded-2xl bg-zinc-50 border-2 border-dashed border-zinc-200 hover:border-zinc-300 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2.5 text-zinc-400 hover:text-zinc-500">
              <span className="w-12 h-12 rounded-2xl bg-white ring-1 ring-zinc-100 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                <ImageIcon className="h-6 w-6 text-zinc-300" />
              </span>
              <span className="text-[13px] font-medium">Add banner</span>
              <span className="text-[11px] text-zinc-300">Shown across your event page</span>
            </button>
          )}
          <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={onBannerFile} />

          {/* Schedule — compact, inline */}
          <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 overflow-hidden">
            <EventTimestamps
              flat
              startDate={startDate}
              endDate={endDate}
              startTime={startTime}
              endTime={endTime}
              timezone={timezone}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onStartTimeChange={setStartTime}
              onEndTimeChange={setEndTime}
              onTimezoneChange={setTimezone}
              errors={formErrors}
            />
          </div>

          {/* Detail rows — done-states (check + snippet) + hover motion */}
          <div className="space-y-2.5">
            <button type="button" onClick={() => setIsLocationOpen(true)}
              className="group w-full flex items-center gap-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
              {hasLocation ? (
                <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-white shrink-0" style={{ background: "var(--brand-color, #18181b)" }}><Check className="h-3 w-3" strokeWidth={3.5} /></span>
              ) : <MapPin className="h-[18px] w-[18px] text-zinc-400 shrink-0 transition-colors group-hover:text-zinc-500" />}
              <span className="flex-1 min-w-0">
                <span className={`block text-sm truncate ${hasLocation ? "font-medium text-zinc-800" : "text-zinc-500"}`}>{hasLocation ? "Location" : "Add location"}</span>
                {hasLocation && <span className="block text-[12.5px] text-zinc-500 truncate">{locationSummary}</span>}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
            </button>

            <button type="button" onClick={() => setIsDescriptionOpen(true)}
              className="group w-full flex items-center gap-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
              {descriptionPreview ? (
                <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-white shrink-0" style={{ background: "var(--brand-color, #18181b)" }}><Check className="h-3 w-3" strokeWidth={3.5} /></span>
              ) : <FileText className="h-[18px] w-[18px] text-zinc-400 shrink-0 transition-colors group-hover:text-zinc-500" />}
              <span className="flex-1 min-w-0">
                <span className={`block text-sm truncate ${descriptionPreview ? "font-medium text-zinc-800" : "text-zinc-500"}`}>{descriptionPreview ? "Description" : "Add description"}</span>
                {descriptionPreview && <span className="block text-[12.5px] text-zinc-500 truncate">{descriptionPreview}</span>}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
            </button>

            <CategoryPickerRow
              categories={categories ?? []}
              categoryId={categoryId}
              subCategoryId={subCategoryId}
              noun="event"
              onChange={({ categoryId: c, subCategoryId: sc }) => {
                setCategoryId(c);
                setSubCategoryId(sc);
              }}
            />

            <button type="button" onClick={() => setIsTagsOpen(true)}
              className="group w-full flex items-center gap-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
              {tags.length > 0 ? (
                <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-white shrink-0" style={{ background: "var(--brand-color, #18181b)" }}><Check className="h-3 w-3" strokeWidth={3.5} /></span>
              ) : <TagIcon className="h-[18px] w-[18px] text-zinc-400 shrink-0 transition-colors group-hover:text-zinc-500" />}
              <span className="flex-1 min-w-0">
                <span className={`block text-sm truncate ${tags.length > 0 ? "font-medium text-zinc-800" : "text-zinc-500"}`}>{tags.length > 0 ? "Tags" : "Add tags"}</span>
                {tags.length > 0 && <span className="block text-[12.5px] text-zinc-500 truncate">{tags.map(t => t.name).join(" · ")}</span>}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
            </button>
          </div>
      </div>
      )}

      {/* Banner Crop Modal */}
      <BannerCropModal
        open={isBannerCropOpen}
        onOpenChange={setIsBannerCropOpen}
        directCropSrc={bannerCropSrc}
        onSave={(result: BannerCropResult) => { if (result.base64) setBannerUrl(result.base64); }}
        title="Frame your photo"
        hideStockPhotos
      />

      {/* ─── Options — pricing (ticket tiers) + the host's approval gate, plus
            community access. On the wizard these are the pricing/approval step
            (page="commerce"), hidden on page="listing". Community access stays
            gated by hideVisibility within and, in the wizard, lives on its own
            access step. ─── */}
      {/* On md+ aligned with the form column (264px = image width 240 + gap 24).
          On mobile no left padding — section uses full container width. */}
      {showCommerce && (
      <div className={`${maxWidthClassName} mt-8`}>
        <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Event Options</p>
        <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 divide-y divide-zinc-100">
          {/* Ticket Tiers */}
          <div className="px-5 py-4 first:rounded-t-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Ticket className="h-[18px] w-[18px] text-zinc-400" />
                <span className="text-sm font-medium text-zinc-800">Tickets</span>
              </div>
              <span className="text-xs text-zinc-400">{tiers.length === 0 ? "Free event" : `${tiers.length} tier${tiers.length > 1 ? "s" : ""}`}</span>
            </div>
            {tiers.length > 0 && (
              <div className="space-y-2 mb-3">
                {tiers.map((t) => {
                  const published = t.publishedAt !== null && t.publishedAt !== undefined;
                  return (
                  /*
                   * The WHOLE row opens the tier editor, matching the product
                   * variant row.
                   *
                   * It used to be a div holding a button and a publish Switch
                   * side by side, because the two could not be nested. That
                   * split was the tell: the row could not be a drill-in while
                   * it also carried a control, so half of it was clickable and
                   * the chevron every other row in this wizard has was missing.
                   *
                   * The switch is gone rather than moved — TierEditView already
                   * renders publish state in its own section (Eye/EyeOff +
                   * "Published"/"Draft" + the switch), and PriceEditModal passes
                   * `onTogglePublish` unconditionally, so it is there in the
                   * create wizard too, not just on the manage page. Keeping a
                   * copy out here was one control writing another's value.
                   *
                   * Draft state stays VISIBLE in the summary line. It is
                   * information, not a control: an unpublished tier is one
                   * buyers cannot see, which should not require opening the
                   * editor to discover.
                   */
                  <button
                    key={t.localId}
                    type="button"
                    onClick={() => openTierEditor(t.localId)}
                    className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-all duration-150 text-left cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-zinc-200 text-zinc-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-zinc-800 truncate">{t.name || "Unnamed tier"}</p>
                      <p className="text-[11px] text-zinc-400">
                        {t.price && parseFloat(t.price) > 0 ? formatPrice(parseFloat(t.price), t.currency) : "Free"}
                        {t.capacity ? ` · ${t.capacity} spots` : ""}
                        {published ? "" : " · Draft"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
                  </button>
                  );
                })}
              </div>
            )}
            <button type="button" onClick={addAndEditTier}
              onMouseEnter={e => { const b = "var(--brand-color, #b8336a)"; e.currentTarget.style.color = b; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--brand-color, #b8336a) 35%, transparent)"; e.currentTarget.style.background = "color-mix(in srgb, var(--brand-color, #b8336a) 6%, transparent)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = ""; e.currentTarget.style.borderColor = ""; e.currentTarget.style.background = ""; }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[13px] font-medium text-zinc-500 border border-dashed border-zinc-200 rounded-xl cursor-pointer transition-all duration-150">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {tiers.length === 0 ? "Add ticket tier" : "Add ticket tier"}
            </button>
          </div>

        </div>

      {/* ─── Donations ─── listing-level; its own row that opens a modal
          (desktop) / drawer (mobile). Outside the Event Options card because a
          donation applies to the whole event, not a single tier. Create takes
          no inline donationConfig, so the consumer PUTs `donation` to
          /communities/:tag/events/:id/donations after create. */}
      <div className="mt-6">
        <DonationsField
          donation={donation}
          onUpdate={(patch) => setDonation((d) => ({ ...d, ...patch }))}
          defaultCurrency={tiers[0]?.currency || "EUR"}
        />
      </div>

      {/* ─── Approval ───
          A SIBLING of Community access, not a parent of it.

          The community-access block used to sit INSIDE this row's
          `flex items-center justify-between` div, which made it a flex child
          next to the switch - so the two rendered side by side on the admin
          form while the products form stacked them. It read as a deliberate
          two-column layout; it was a stray nesting.

          NOT community-scoped. requiresApproval is deliberately outside
          COMMUNITY_SCOPED_EVENT_FIELDS, so a member hosting their own event
          may set it and the backend allows it. It gets its own card rather
          than moving above, or member hosts would lose a setting they own. */}
      <div className="mt-6">
        <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Approval</p>
        <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 divide-y divide-zinc-100">
      {/* Require Approval */}
      <div
        onClick={() => setRequiresApproval(!requiresApproval)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-50/50 transition-colors">
        <div className="flex items-center gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
          <div>
            <span className="text-sm font-medium text-zinc-800">Require Approval</span>
            <p className="text-[11px] text-zinc-400 mt-0.5">Review attendees before confirming their registration</p>
          </div>
        </div>
        <Switch checked={requiresApproval}
          onCheckedChange={setRequiresApproval}
          onClick={e => e.stopPropagation()} />
        </div>
        </div>
      </div>

      {/* ─── Attendees ───
          Who can see WHO ELSE is coming. A third visibility axis, and its own
          card rather than a row under Approval, because it is not about
          approval: `viewability` gates the event, `accessibility` gates
          registering, this gates the roster. They do not move together — a
          fully public event with a private guest list is the case hosts asked
          for.

          A row that opens a picker, not a dropdown: four mutually exclusive
          options where each needs a sentence to be understood, and a dropdown
          can only show the sentence for the one already chosen.

          The choice only affects the customer-facing portal. Hosts and
          community leaders reach the roster through the event's manage page,
          which always asks for it as management, so nothing here can lock a
          host out of their own attendee list. Same reason as requiresApproval
          above, it is NOT community-scoped: a member hosting their own event
          owns this decision about their own guest list. */}
      <div className="mt-6">
        <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Attendees</p>
        {/* A ROW that opens a picker, not a dropdown.

            Four options where each needs a sentence to be understood, and a
            <select> can only show the sentence for the one already chosen — so
            the consequence of the other three is invisible at the moment you
            are choosing between them. The sheet lists all four with their
            explanation and ticks the current one, which is the same shape the
            location, description and category rows on this form already use. */}
        <button
          type="button"
          onClick={() => setAttendeeVisibilityOpen(true)}
          className="group w-full flex items-center gap-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer"
        >
          <Users className="h-[18px] w-[18px] text-zinc-400 shrink-0 transition-colors group-hover:text-zinc-500" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-zinc-800">Who can see the guest list</span>
            <span className="block text-[12.5px] text-zinc-500 truncate">
              {selectedAttendeeOption?.label} · {selectedAttendeeOption?.hint}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
        </button>
      </div>

      <Dialog open={attendeeVisibilityOpen} onOpenChange={setAttendeeVisibilityOpen}>
        {/* hideClose, then our own: the built-in X is a bare 16px glyph at 70%
            opacity with no hit area to speak of, which on a white sheet reads
            as a smudge rather than a control. */}
        <DialogContent hideClose>
          <button
            type="button"
            onClick={() => setAttendeeVisibilityOpen(false)}
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          <DialogHeader>
            <DialogTitle>Who can see the guest list</DialogTitle>
            <DialogDescription>
              This applies to the event page and anywhere else the community
              shows who is going. You and the community&rsquo;s team always see
              the full list on the event&rsquo;s manage page.
            </DialogDescription>
          </DialogHeader>

          {/* Radio semantics, not a list of buttons: these are four mutually
              exclusive answers to one question, and a screen reader should say
              so. Picking closes the sheet — there is nothing to confirm when a
              single choice IS the whole decision. */}
          <div role="radiogroup" aria-label="Who can see the guest list" className="py-1">
            {ATTENDEE_VISIBILITY_OPTIONS.map((o) => {
              const selected = o.value === attendeeVisibility;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setAttendeeVisibility(o.value);
                    setAttendeeVisibilityOpen(false);
                  }}
                  className={`group w-full flex items-center gap-3 px-3 py-3 text-left rounded-xl transition-colors cursor-pointer ring-1 ${
                    selected
                      ? "bg-zinc-50 ring-zinc-200"
                      : "ring-transparent hover:bg-zinc-100 hover:ring-zinc-200"
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm ${selected ? "font-semibold text-zinc-900" : "font-medium text-zinc-800"}`}>
                      {o.label}
                    </span>
                    <span className="block text-[12.5px] text-zinc-500">{o.hint}</span>
                  </span>
                  {/* EVERY row carries the control, filled only on the chosen
                      one. Drawing it solely on the selection left the other
                      three looking like plain text, so there was nothing to
                      tell you they could be picked — the affordance appeared
                      only after you had already found it. Empty ring vs filled
                      tick is the same vocabulary AccessibilityEditModal's
                      RadioRow uses. */}
                  {selected ? (
                    <span
                      className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-white shrink-0"
                      style={{ background: "var(--brand-color, #18181b)" }}
                    >
                      <Check className="h-3 w-3" strokeWidth={3.5} />
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className="w-[22px] h-[22px] rounded-full border-2 border-zinc-300 shrink-0 transition-colors group-hover:border-zinc-400"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* A Close button INSIDE a footer, not acting AS the footer. The
              negative margins undo DialogContent's own p-6 so the hairline runs
              edge to edge, while the button stays inset and keeps the sheet's
              corner radius. Muted, because closing is not the action here —
              picking an option is, and it already closes the sheet. */}
          <div className="-mx-6 -mb-6 mt-2 border-t border-zinc-100 px-6 py-4">
            <button
              type="button"
              onClick={() => setAttendeeVisibilityOpen(false)}
              className="w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 cursor-pointer"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Who can see the location ───
          A FOURTH visibility axis, sibling to the guest-list one above. It
          governs the PHYSICAL address only: some hosts keep a venue back until
          you hold a ticket. The online meeting link is a separate rule the host
          does not control here — it is always attendee-only — so this row is
          only meaningful for an event with a physical location. Same server-side
          enforcement and same manage-page exemption as the guest list. */}
      <div className="mt-6">
        <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Location</p>
        <button
          type="button"
          onClick={() => setLocationVisibilityOpen(true)}
          className="group w-full flex items-center gap-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer"
        >
          <MapPin className="h-[18px] w-[18px] text-zinc-400 shrink-0 transition-colors group-hover:text-zinc-500" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-zinc-800">Who can see the location</span>
            <span className="block text-[12.5px] text-zinc-500 truncate">
              {selectedLocationOption?.label} · {selectedLocationOption?.hint}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
        </button>
      </div>

      <Dialog open={locationVisibilityOpen} onOpenChange={setLocationVisibilityOpen}>
        <DialogContent hideClose>
          <button
            type="button"
            onClick={() => setLocationVisibilityOpen(false)}
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          <DialogHeader>
            <DialogTitle>Who can see the location</DialogTitle>
            <DialogDescription>
              This controls the physical address on the event page. An online
              meeting link is always shown only to people with a ticket. You and
              the community&rsquo;s team always see the address on the manage page.
            </DialogDescription>
          </DialogHeader>

          <div role="radiogroup" aria-label="Who can see the location" className="py-1">
            {LOCATION_VISIBILITY_OPTIONS.map((o) => {
              const selected = o.value === locationVisibility;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setLocationVisibility(o.value);
                    setLocationVisibilityOpen(false);
                  }}
                  className={`group w-full flex items-center gap-3 px-3 py-3 text-left rounded-xl transition-colors cursor-pointer ring-1 ${
                    selected
                      ? "bg-zinc-50 ring-zinc-200"
                      : "ring-transparent hover:bg-zinc-100 hover:ring-zinc-200"
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm ${selected ? "font-semibold text-zinc-900" : "font-medium text-zinc-800"}`}>
                      {o.label}
                    </span>
                    <span className="block text-[12.5px] text-zinc-500">{o.hint}</span>
                  </span>
                  {selected ? (
                    <span
                      className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-white shrink-0"
                      style={{ background: "var(--brand-color, #18181b)" }}
                    >
                      <Check className="h-3 w-3" strokeWidth={3.5} />
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className="w-[22px] h-[22px] rounded-full border-2 border-zinc-300 shrink-0 transition-colors group-hover:border-zinc-400"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="-mx-6 -mb-6 mt-2 border-t border-zinc-100 px-6 py-4">
            <button
              type="button"
              onClick={() => setLocationVisibilityOpen(false)}
              className="w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 cursor-pointer"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

        {/* ─── Community access ───
            Visibility and Purchase exist ONLY because a community owns this
            event: the backend refuses both on a personal one
            (COMMUNITY_SCOPED_EVENT_FIELDS, 403). They used to sit in the card
            above and simply vanish for a member host, which read as two
            missing features rather than one rule. Grouped and labelled, the
            absence explains itself. */}
        {!hideVisibility && (
          <div className="mt-6">
            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Community access</p>
            <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 divide-y divide-zinc-100">

            {/* Who can SEE it. Two tiers of control in one list: Public and
                All members are shortcuts that imply every membership tier
                below them, so picking either ticks and freezes the rows. See
                MembershipTierPicker - "frozen" there means already included,
                which is the opposite of the card-level rule where a
                capability you cannot have is not rendered at all. */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-3">
                {viewResolved.visibility === "PUBLIC" ? <Eye className="h-[18px] w-[18px] text-zinc-400" /> : <EyeOff className="h-[18px] w-[18px] text-zinc-400" />}
                <div>
                  <span className="text-sm font-medium text-zinc-800">Who can see it</span>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{tierAccessSummary(viewAccess, membershipTiers)}</p>
                </div>
              </div>
              <MembershipTierPicker
                value={viewAccess}
                onChange={changeViewAccess}
                tiers={membershipTiers}
                publicLabel="Anyone, including people who are not members"
              />
            </div>

            {/* Who can REGISTER. Separate axis on purpose: showing an event to
                every member while selling to one tier is the case the feature
                exists for. */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-3">
                {buyResolved.visibility === "PUBLIC" ? <UserCheck className="h-[18px] w-[18px] text-zinc-400" /> : <Lock className="h-[18px] w-[18px] text-zinc-400" />}
                <div>
                  <span className="text-sm font-medium text-zinc-800">Who can register</span>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{tierAccessSummary(buyAccess, membershipTiers)}</p>
                </div>
              </div>
              <MembershipTierPicker
                value={buyAccess}
                onChange={setBuyAccess}
                tiers={membershipTiers}
                publicLabel="Anyone can register, members or not"
                ceiling={buyCeiling}
              />
            </div>
          </div>
          {/* The two questions read back as ONE rule. The card asks them in
              two groups and never stated the combined result, which is exactly
              where "visible to Founding, registerable by anyone" hid. Null for
              a fully public event - that needs no narrating. */}
          {tierAccessConsequence(viewAccess, buyAccess, membershipTiers, "register") && (
            <p className="text-[11px] text-zinc-500 mt-2 px-1 leading-relaxed">
              {tierAccessConsequence(viewAccess, buyAccess, membershipTiers, "register")}
            </p>
          )}
          <p className="text-[11px] text-zinc-400 mt-2 px-1">
            Available because {communityName || "this community"} owns this event.
          </p>
        </div>
      )}
      </div>
      )}

      {/* ─── Description Editor Dialog ─── */}
      <Dialog open={isDescriptionOpen} onOpenChange={setIsDescriptionOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Event Description</DialogTitle>
            <DialogDescription>Describe your event. What should attendees expect?</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <RichTextEditor content={description} onChange={setDescription} placeholder="Write your event description..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDescriptionOpen(false)}>Cancel</Button>
            <Button onClick={() => setIsDescriptionOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Tier Manager Modal ───
          Uses the shared PriceEditModal in draftMode so the create-event
          experience matches the post-creation edit-event experience
          (3-level takeover, drag-to-reorder, PWYW, capacity, donations).
          Parent owns the tier state — modal calls onDraftCommit with the
          validated payload on Save, which we round-trip back into the
          TierItem[] state.

          No inner provider here — the consuming app wraps <EventForm> in
          EventManagementConfigProvider, so the modal reads apiBaseUrl +
          authHeaders from the same context the rest of the form uses. */}
      {showTierModal && (
        <PriceEditModal
          communityTag={communityTag}
          onClose={closeTierModal}
          onSaved={closeTierModal}
          /*
           * Console-only on purpose: EventForm has no toast host of its own,
           * and inventing one would collide with whatever the consuming app
           * renders. Safe only because PriceEditModal surfaces its own
           * failures inline (see saveError there) — until 2026-08-08 it did
           * not, so this stub meant a rejected Save printed to a console the
           * member never opens and changed nothing on screen. If a consumer
           * wants toasts, thread its own through rather than filling this in.
           */
          showToast={(msg) => console.warn("[EventForm tier modal]", msg)}
          draftMode
          // Community-owned events surface member (tier) pricing in the create
          // wizard; the overrides ride the create-event payload. Off for member
          // submissions (they can't set community pricing).
          showMemberPricing={showMemberPricing}
          initialDraftTiers={tiersToDrafts(pendingNewTier ? [...tiers, pendingNewTier] : tiers)}
          openTierLocalId={editTierLocalId}
          onDraftCommit={handleTiersCommit}
        />
      )}

      {/* ─── Location Modal ─── */}
      {/* hideClose: house style is no top-right X on a modal that carries its
          own bottom actions — two ways to dismiss, one of them unlabelled,
          and the X sits where a form's first field wants to be. */}
      <Dialog open={isLocationOpen} onOpenChange={setIsLocationOpen}>
        <DialogContent className="sm:max-w-xl" hideClose>
          <DialogHeader>
            <DialogTitle>Event Location</DialogTitle>
            <DialogDescription>Add a physical location and/or online event link.</DialogDescription>
          </DialogHeader>
          {/* Phase 2: the repeatable field replaces the single physical+online
              selector. `locations` is the source of truth; the legacy flat
              fields mirror its primary via the effect above. */}
          <EventLocationsField value={locations} onChange={setLocations} />
          <DialogFooter>
            {/* secondary, not outline: an outline button reads as equal weight
                to Done and competes with it. */}
            <Button variant="secondary" onClick={() => setIsLocationOpen(false)}>Cancel</Button>
            <Button onClick={() => setIsLocationOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Tags Modal ─── */}
      <Dialog open={isTagsOpen} onOpenChange={setIsTagsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Event Tags</DialogTitle>
            <DialogDescription>Add tags to help people discover your event.</DialogDescription>
          </DialogHeader>
          <EventTags selectedTags={tags} onTagsChange={setTags} placeholder="Search or create tags..." />
          <DialogFooter>
            <Button onClick={() => setIsTagsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
