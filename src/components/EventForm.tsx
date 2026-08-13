"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../ui/dialog";
import { EventTimestamps } from "../ui/event-timestamps";
import { EventLocationSelector } from "../ui/event-location-selector";
import { EventTags } from "../ui/event-tags";
import { BannerCropModal, type BannerCropResult } from "../ui/banner-crop-modal";
import { RichTextEditor } from "../ui/rich-text-editor";
import { htmlToPlainText } from "../lib/htmlToPlainText";
import { CategoryPickerRow, type CategoryOption } from "./CategoryPickerRow";
import {
  Ticket, Lock, UserCheck, Image as ImageIcon, X,
  Eye, EyeOff, Check, ChevronRight, MapPin, FileText, Tag as TagIcon,
} from "lucide-react";
import { PriceEditModal } from "./PriceEditModal";
import type { DraftTier, DonationDraft } from "./PriceEditModal/types";
import { blankTier } from "./PriceEditModal/helpers";
import { useStripeStatus, StripeRequiredWarning } from "./stripe-status";
import {
  MembershipTierPicker,
  toTierAccessValue,
  fromTierAccessValue,
  tierAccessSummary,
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
  // Action gate — who can RSVP (existing field, "Attendance" toggle below).
  accessibility: "PUBLIC" | "MEMBERS_ONLY";
  // View gate — who can SEE the event detail page (new, PR 8 of
  // feat/visibility-overrides). Optional on the type so callers from
  // before the rollout still type-check; the form defaults it to
  // "PUBLIC" if not provided.
  viewability?: "PUBLIC" | "MEMBERS_ONLY";
  requiresApproval: boolean;
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
}

// ─── Component ─────────────────────────────────────────────────

export function EventForm({ communityTag, initialData, onChange, showErrors, ownership, onOwnershipChange, communityName, communityIcon, userName, userAvatar, hideVisibility, categories, membershipTiers = [], initialViewTierIds, initialBuyTierIds, maxWidthClassName = "max-w-3xl" }: EventFormProps) {
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
  const [onlineUrl, setOnlineUrl] = useState(initialData?.onlineUrl || "");
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
  const [showStripeWarning, setShowStripeWarning] = useState(false);

  // Stripe status — read via the shared hook, which pulls apiBaseUrl +
  // authHeaders from EventManagementConfigProvider (the consumer wraps
  // this form in the provider). Gates paid-tier creation for communities
  // that haven't connected Stripe yet.
  const stripe = useStripeStatus(communityTag);
  const stripeReady = stripe.connected && stripe.chargesEnabled;

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

  function openTierModal() {
    // Only block once we've confirmed Stripe is NOT ready. While the
    // status is still loading we optimistically allow the modal to open
    // (matches the admin's legacy `stripeConnected === false` gate).
    if (!stripe.loading && !stripeReady) { setShowStripeWarning(true); return; }
    setShowTierModal(true);
  }

  // Open the per-tier edit screen for an existing tier (edit) or a freshly
  // appended blank tier (add). Same Stripe gate as openTierModal.
  function openTierEditor(localId: string) {
    if (!stripe.loading && !stripeReady) { setShowStripeWarning(true); return; }
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
      physicalLocation, onlineUrl,
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
      requiresApproval, tiers: submittableTiers, tags,
      categoryId, subCategoryId,
    });
  }, [name, description, bannerUrl, startDate, endDate, startTime, endTime, timezone,
      physicalLocation, onlineUrl, viewAccess, buyAccess, requiresApproval, submittableTiers, tags,
      categoryId, subCategoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasLocation = !!(physicalLocation.trim() || onlineUrl.trim());

  return (
    <div>
      {/* ─── Single column: title → banner hero → schedule → detail rows.
            Mirrors the product form's polish (media hero + done-states). ─── */}
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
                {hasLocation && <span className="block text-[12.5px] text-zinc-500 truncate">{[physicalLocation.trim(), onlineUrl.trim()].filter(Boolean).join(" · ")}</span>}
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

      {/* Banner Crop Modal */}
      <BannerCropModal
        open={isBannerCropOpen}
        onOpenChange={setIsBannerCropOpen}
        directCropSrc={bannerCropSrc}
        onSave={(result: BannerCropResult) => { if (result.base64) setBannerUrl(result.base64); }}
        title="Frame your photo"
        hideStockPhotos
      />

      {/* ─── Options ─── */}
      {/* On md+ aligned with the form column (264px = image width 240 + gap 24).
          On mobile no left padding — section uses full container width. */}
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
                  <div
                    key={t.localId}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-all duration-150"
                  >
                    {/* Only this part opens the tier. The row itself cannot be
                        the button — the publish switch is interactive, and
                        nesting the two is invalid HTML that fires both
                        handlers on a single click. */}
                    <button
                      type="button"
                      onClick={() => openTierEditor(t.localId)}
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer text-left"
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-zinc-200 text-zinc-600">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-zinc-800 truncate">{t.name || "Unnamed tier"}</p>
                        <p className="text-[11px] text-zinc-400">
                          {t.price && parseFloat(t.price) > 0 ? formatPrice(parseFloat(t.price), t.currency) : "Free"}
                          {t.capacity ? ` · ${t.capacity} spots` : ""}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10.5px] ${published ? "text-zinc-500" : "text-zinc-400"}`}>
                        {published ? "Published" : "Draft"}
                      </span>
                      <Switch
                        checked={published}
                        aria-label={`Publish ${t.name || "tier"}`}
                        onCheckedChange={(next: boolean) => setTiers(prev => prev.map(x =>
                          x.localId === t.localId
                            ? { ...x, publishedAt: next ? new Date().toISOString() : null }
                            : x))}
                      />
                    </div>
                  </div>
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

      {/* ─── Approval ───
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
                onChange={setViewAccess}
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
              />
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 mt-2 px-1">
            Available because {communityName || "this community"} owns this event.
          </p>
        </div>
      )}

      </div>
          </div>
        </div>
      </div>

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
          <EventLocationSelector
            physicalLocation={physicalLocation}
            onlineUrl={onlineUrl}
            onPhysicalLocationChange={setPhysicalLocation}
            onOnlineUrlChange={setOnlineUrl}
            hideHeader
          />
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

      {/* Stripe Required Warning — shared modal; connect-link target comes
          from the consumer's EventManagementConfig (`stripeConnectUrl`). */}
      {showStripeWarning && (
        <StripeRequiredWarning communityTag={communityTag} onClose={() => setShowStripeWarning(false)} />
      )}
    </div>
  );
}
