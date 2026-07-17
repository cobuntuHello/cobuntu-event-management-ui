"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
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
import {
  Ticket, Lock, UserCheck, Image as ImageIcon,
  Eye, EyeOff, Check, ChevronRight, MapPin, FileText, Tag as TagIcon,
} from "lucide-react";
import { PriceEditModal } from "./PriceEditModal";
import type { DraftTier, DonationDraft } from "./PriceEditModal/types";
import { blankTier } from "./PriceEditModal/helpers";
import { useStripeStatus, StripeRequiredWarning } from "./stripe-status";

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
}

export interface EventFormData {
  name: string;
  description: string;
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
  tiers: TierItem[];
  tags: Tag[];
}

interface EventFormProps {
  communityTag: string;
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
}

// ─── Component ─────────────────────────────────────────────────

export function EventForm({ communityTag, initialData, onChange, showErrors, ownership, onOwnershipChange, communityName, communityIcon, userName, userAvatar, hideVisibility }: EventFormProps) {
  // Form state
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
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
  const [requiresApproval, setRequiresApproval] = useState(initialData?.requiresApproval || false);
  const [tiers, setTiers] = useState<TierItem[]>(initialData?.tiers || []);
  const [tags, setTags] = useState<Tag[]>(initialData?.tags || []);

  // UI state
  const [isBannerCropOpen, setIsBannerCropOpen] = useState(false);
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
  function addAndEditTier() {
    const nt: TierItem = {
      localId: crypto.randomUUID(),
      name: "", description: "", price: "", currency: "EUR",
      capacity: "", isRecurring: false, recurringInterval: "monthly",
    };
    setTiers((prev) => [...prev, nt]);
    openTierEditor(nt.localId);
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
        // Recurring fields aren't surfaced by the events PriceEditModal
        // (events don't support subscription tiers); reset to defaults.
        isRecurring: false,
        recurringInterval: "monthly",
      })),
    );
    setShowTierModal(false);
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

  // Notify parent — use useLayoutEffect to ensure data is synced before unmount
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useLayoutEffect(() => {
    onChangeRef.current?.({
      name, description, bannerUrl, startDate, endDate, startTime, endTime, timezone,
      physicalLocation, onlineUrl,
      accessibility, viewability, requiresApproval, tiers, tags,
    });
  }, [name, description, bannerUrl, startDate, endDate, startTime, endTime, timezone,
      physicalLocation, onlineUrl, accessibility, viewability, requiresApproval, tiers, tags]);

  const hasLocation = !!(physicalLocation.trim() || onlineUrl.trim());

  return (
    <div>
      {/* ─── Single column: title → banner hero → schedule → detail rows.
            Mirrors the product form's polish (media hero + done-states). ─── */}
      <div className="space-y-5 max-w-3xl">
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

          {/* Banner hero — big cover; object-cover so it fills without
              distorting (WYSIWYG with the event card), never stretched. */}
          <button type="button" onClick={() => setIsBannerCropOpen(true)}
            className={`group relative block w-full max-w-[360px] aspect-square rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${bannerUrl ? "ring-1 ring-zinc-100 hover:ring-zinc-200 hover:shadow-[0_16px_34px_-18px_rgba(60,40,30,0.5)]" : "bg-zinc-50 border-2 border-dashed border-zinc-200 hover:border-zinc-300"}`}>
            {bannerUrl ? (
              <>
                <img src={bannerUrl} alt="Event banner" className="w-full h-full object-cover" />
                <span className="absolute top-3 left-3 text-[11px] font-semibold tracking-wide bg-white/85 backdrop-blur-sm text-zinc-800 px-2.5 py-1 rounded-full">Cover</span>
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/25 text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  <ImageIcon className="h-[18px] w-[18px]" /> Change banner
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-zinc-400 transition-colors group-hover:text-zinc-500">
                <div className="w-12 h-12 rounded-2xl bg-white ring-1 ring-zinc-100 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                  <ImageIcon className="h-6 w-6 text-zinc-300" />
                </div>
                <span className="text-[13px] font-medium">Add banner</span>
                <span className="text-[11px] text-zinc-300">Shown across your event page</span>
              </div>
            )}
          </button>

          {/* Schedule — compact, inline */}
          <div className="rounded-2xl bg-white ring-1 ring-zinc-100 overflow-hidden">
            <EventTimestamps
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
              className="group w-full flex items-center gap-3 rounded-2xl bg-white ring-1 ring-zinc-100 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
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
              className="group w-full flex items-center gap-3 rounded-2xl bg-white ring-1 ring-zinc-100 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
              {description.replace(/<[^>]*>/g, "").trim() ? (
                <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-white shrink-0" style={{ background: "var(--brand-color, #18181b)" }}><Check className="h-3 w-3" strokeWidth={3.5} /></span>
              ) : <FileText className="h-[18px] w-[18px] text-zinc-400 shrink-0 transition-colors group-hover:text-zinc-500" />}
              <span className="flex-1 min-w-0">
                <span className={`block text-sm truncate ${description.replace(/<[^>]*>/g, "").trim() ? "font-medium text-zinc-800" : "text-zinc-500"}`}>{description.replace(/<[^>]*>/g, "").trim() ? "Description" : "Add description"}</span>
                {description.replace(/<[^>]*>/g, "").trim() && <span className="block text-[12.5px] text-zinc-500 truncate">{description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}</span>}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
            </button>

            <button type="button" onClick={() => setIsTagsOpen(true)}
              className="group w-full flex items-center gap-3 rounded-2xl bg-white ring-1 ring-zinc-100 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer">
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
        initialImageSrc={bannerUrl}
        onSave={(result: BannerCropResult) => { setBannerUrl(result.base64 || ""); }}
        title="Event Image"
      />

      {/* ─── Options ─── */}
      {/* On md+ aligned with the form column (264px = image width 240 + gap 24).
          On mobile no left padding — section uses full container width. */}
      <div className="max-w-3xl mt-8">
        <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Event Options</p>
        <div className="rounded-2xl bg-white ring-1 ring-zinc-100 divide-y divide-zinc-100">
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
                {tiers.map((t) => (
                  <button
                    type="button"
                    key={t.localId}
                    onClick={() => openTierEditor(t.localId)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-colors cursor-pointer text-left"
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
                ))}
              </div>
            )}
            <button type="button" onClick={addAndEditTier}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[13px] font-medium text-zinc-500 hover:text-zinc-700 border border-dashed border-zinc-200 hover:border-zinc-300 rounded-xl cursor-pointer transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {tiers.length === 0 ? "Add ticket tier" : "Add ticket tier"}
            </button>
          </div>

          {/* Visibility + Attendance — the members-only community gates.
              Leader-only: dropped for member submissions via `hideVisibility`
              (the consumer owns the values, defaulting PUBLIC/PUBLIC). */}
          {!hideVisibility && (
            <>
          {/* Visibility — who can SEE the event (view gate) */}
          <div
            onClick={() => setViewability(viewability === "PUBLIC" ? "MEMBERS_ONLY" : "PUBLIC")}
            className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-50/50 transition-colors">
            <div className="flex items-center gap-3">
              {viewability === "PUBLIC" ? <Eye className="h-[18px] w-[18px] text-zinc-400" /> : <EyeOff className="h-[18px] w-[18px] text-zinc-400" />}
              <div>
                <span className="text-sm font-medium text-zinc-800">Visibility: {viewability === "PUBLIC" ? "Public" : "Members Only"}</span>
                <p className="text-[11px] text-zinc-400 mt-0.5">Who can see this event listing</p>
              </div>
            </div>
            <Switch checked={viewability === "MEMBERS_ONLY"}
              onCheckedChange={checked => setViewability(checked ? "MEMBERS_ONLY" : "PUBLIC")}
              onClick={e => e.stopPropagation()} />
          </div>

          {/* Attendance — who can RSVP/purchase (action gate) */}
          <div
            onClick={() => setAccessibility(accessibility === "PUBLIC" ? "MEMBERS_ONLY" : "PUBLIC")}
            className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-50/50 transition-colors">
            <div className="flex items-center gap-3">
              {accessibility === "PUBLIC" ? <UserCheck className="h-[18px] w-[18px] text-zinc-400" /> : <Lock className="h-[18px] w-[18px] text-zinc-400" />}
              <div>
                <span className="text-sm font-medium text-zinc-800">Attendance: {accessibility === "PUBLIC" ? "Public" : "Members Only"}</span>
                <p className="text-[11px] text-zinc-400 mt-0.5">Who can register / RSVP</p>
              </div>
            </div>
            <Switch checked={accessibility === "MEMBERS_ONLY"}
              onCheckedChange={checked => setAccessibility(checked ? "MEMBERS_ONLY" : "PUBLIC")}
              onClick={e => e.stopPropagation()} />
          </div>
            </>
          )}

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
          onClose={() => setShowTierModal(false)}
          onSaved={() => setShowTierModal(false)}
          showToast={(msg) => console.warn("[EventForm tier modal]", msg)}
          draftMode
          initialDraftTiers={tiersToDrafts(tiers)}
          openTierLocalId={editTierLocalId}
          onDraftCommit={handleTiersCommit}
        />
      )}

      {/* ─── Location Modal ─── */}
      <Dialog open={isLocationOpen} onOpenChange={setIsLocationOpen}>
        <DialogContent className="sm:max-w-xl">
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
            <Button variant="outline" onClick={() => setIsLocationOpen(false)}>Cancel</Button>
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
