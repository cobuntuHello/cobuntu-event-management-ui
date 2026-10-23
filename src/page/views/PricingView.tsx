"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { PriceEditModal } from "../../components/PriceEditModal";
import { theme, muted } from "../../shared/theme";
import {
  getSymbol,
  toDisplay,
  loadDonationFromEvent,
  buildDonationBody,
} from "../../components/PriceEditModal/helpers";
import { DonationsSection } from "../../components/PriceEditModal/DonationsSection";
import type { DonationDraft } from "../../components/PriceEditModal/types";
import { useEventManagementConfig, useJsonHeaders } from "../../config";
import { useCanEdit } from "../../lib/manageAccess";

/**
 * PRICING TAB — the tier list, as the create wizard shows it.
 *
 * Why this view exists at all
 * ───────────────────────────
 * Tiers were reachable from Details through one small "price" control on the
 * event card, which opened PriceEditModal on its Level 1 list: a column of
 * compact rows. Meanwhile the create wizard had already moved to a much more
 * legible pattern — a full-width card per tier showing name, price and a fact
 * strip, with the whole card as the tap target into that tier's editor.
 *
 * So the same host met two different models for the same object depending on
 * whether the event existed yet, and the worse one was the one they returned
 * to for the rest of the event's life.
 *
 * This view is the wizard's pattern, on the manage page. Deliberately NOT a
 * near-copy: the card markup, the fact strip, the drill-in chevron and the
 * dashed "Add ticket type" affordance are the same structure and type scale as
 * EventForm's tier list, so moving between create and manage is not a context
 * switch.
 *
 * What is different, and has to be
 * ────────────────────────────────
 * The wizard runs PriceEditModal in `draftMode`: no fetches, no writes, and the
 * parent owns the drafts until the create payload posts. Here the event exists,
 * so the modal runs in its normal mode and each Save is a real write. That is
 * the whole reason this is not just "render the wizard component": the data
 * flow is inverted even though the pixels are not.
 *
 * `openTierLocalId` is what makes the card land on the tier's own editor
 * instead of the list. It already existed for the wizard, and saved tiers reuse
 * their backend id as `localId` (PriceEditModal:298), so passing `tier.id`
 * works unchanged outside draftMode.
 *
 * Facts come from `event.tiers`, which the manage page already has, rather than
 * from the per-tier form fetch the modal does on open. That keeps this view
 * free of its own loading state; the cost is that the form fact reports whether
 * a form is linked rather than how many questions it has, because the count is
 * not in this payload.
 */

export interface PricingViewProps {
  event: any;
  communityTag: string;
  eventId: string;
  /** Refetch the event after a write, so cards reflect what was saved. */
  onUpdate: () => void;
  showToast: (msg: string) => void;
}

/** One fact-strip cell. Always rendered, even when unset, so a host
 *  discovers the setting exists behind the card rather than only
 *  meeting it once it has a value. Mirrors EventForm. */
function Fact({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex-1 min-w-[110px] px-4 py-2.5 border-r border-zinc-100 last:border-r-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{k}</p>
      <p className="text-[13px] font-medium mt-0.5 tabular-nums" style={color ? { color } : { color: "#27272a" }}>
        {v}
      </p>
    </div>
  );
}

export function PricingView({
  event,
  communityTag,
  eventId,
  onUpdate,
  showToast,
}: PricingViewProps) {
  /** Which tier's editor is open: a tier id, "__new__", or null. */
  const [editingTier, setEditingTier] = useState<string | null>(null);

  /*
   * READ-ONLY GATE.
   *
   * A community leader whose community merely CARRIES someone else's event is
   * not its host, and must not be able to reprice their tickets. The cards
   * stay visible -- what an event costs is not a secret from the leader
   * listing it -- but every opener is blocked and the Add affordance is gone,
   * rather than opening an editor whose Save would be refused at the API.
   */
  const canEdit = useCanEdit();
  const openTier = (key: string) => {
    if (!canEdit) return;
    setEditingTier(key);
  };

  /*
   * DONATIONS — the "whole listing" sidecar, as the wizard shows it.
   *
   * The wizard's pricing step is tiers AND donations: DonationsField sits
   * directly under the tier list. This tab was shipped with the tier half
   * only, which made it a near-copy rather than the same step.
   *
   * On the manage page the same editor already existed, but inside
   * PriceEditModal's Level 1 list -- the surface these cards deliberately
   * skip. So it was still reachable (Details -> the small price control) and
   * absent from the tab that is now the natural home for it.
   *
   * Independent of tiers, and saved independently: its own PUT /donations,
   * which is exactly what the modal does. `donationDirty` keeps an untouched
   * visit from issuing a pointless write -- and more importantly from sending
   * a cleared config for a host who only came to look.
   */
  const { apiBaseUrl } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [donation, setDonation] = useState<DonationDraft>(() => loadDonationFromEvent(event));
  const [donationDirty, setDonationDirty] = useState(false);
  const [savingDonation, setSavingDonation] = useState(false);

  const updateDonation = (patch: Partial<DonationDraft>) => {
    if (!canEdit) return;
    setDonationDirty(true);
    setDonation((d) => ({ ...d, ...patch }));
  };

  const saveDonation = async () => {
    if (!canEdit || !donationDirty || savingDonation) return;
    setSavingDonation(true);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/communities/${communityTag}/events/${eventId}/donations`,
        {
          method: "PUT",
          headers: jsonHeaders(),
          body: JSON.stringify(buildDonationBody(donation, tiers[0]?.products?.currency || "EUR")),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to save donation settings");
      }
      setDonationDirty(false);
      showToast("Donations updated");
      onUpdate();
    } catch (e: any) {
      showToast(e?.message || "Failed to save donation settings");
    } finally {
      setSavingDonation(false);
    }
  };

  const tiers: any[] = Array.isArray(event?.tiers) ? event.tiers : [];

  const close = () => setEditingTier(null);
  const saved = () => {
    setEditingTier(null);
    onUpdate();
  };

  return (
    <div className="space-y-6">
      {/* No card around these sections.
          The tier cards are the objects on this page; wrapping them in another
          bordered surface nested a card inside a card and made the real ones
          read as list rows rather than as the things you open. The section is
          just a heading and its content now. */}
      <div>
        <h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>
          Ticket types
        </h2>
        <p className="text-[12px] mt-1 mb-4 max-w-[68ch] leading-relaxed" style={muted(0.6)}>
          Each ticket type is a version attendees can register for, with its own price, capacity
          and sign-up form. Open one to edit it.
        </p>

        {tiers.length > 0 && (
          <div className="space-y-2 mb-3">
            {tiers.map((t: any) => {
              // Prices arrive in the SMALLEST UNIT. toDisplay is the same
              // conversion PriceEditModal applies when it loads these rows, so
              // the card and the editor cannot disagree -- and a raw read here
              // would have rendered 2500 as "2500.00" instead of "25.00".
              const cur = t?.products?.currency || "EUR";
              const minor = Number(t?.products?.price ?? 0);
              const major = toDisplay(minor, cur);
              const price = minor > 0 ? `${getSymbol(cur)}${major.toFixed(2)}` : "Free";
              const cap = t?.capacity != null ? Number(t.capacity) : null;
              // `tier_forms` is the relation; `formId` is the denormalised
              // column. Either means a form is linked — AddAttendeesModal
              // reads the same pair, so this view agrees with it rather
              // than inventing a third notion of "has a form".
              const hasForm = (t?.tier_forms && t.tier_forms.length > 0) || !!t?.formId;
              const published = !!t?.publishedAt;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openTier(t.id)}
                  className="group w-full text-left rounded-xl bg-zinc-50 border border-zinc-100 hover:bg-zinc-100 hover:border-zinc-200 transition-all duration-150 cursor-pointer overflow-hidden"
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-zinc-200 text-zinc-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="1" y="4" width="22" height="16" rx="2" />
                        <line x1="1" y1="10" x2="23" y2="10" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-zinc-800 truncate">
                        {t?.name || "Unnamed tier"}
                      </p>
                      <p className="text-[12px] text-zinc-400 mt-0.5 truncate">{price}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
                  </div>
                  <div className="flex flex-wrap border-t border-zinc-100">
                    <Fact k="Capacity" v={cap != null ? `${cap} spots` : "Unlimited"} />
                    <Fact k="Sign-up form" v={hasForm ? "Linked" : "Not set"} />
                    <Fact
                      k="Status"
                      v={published ? "Published" : "Draft"}
                      color={published ? "#15803d" : "#a16207"}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {canEdit && (
        <>
        {/* Same dashed affordance and brand-tinted hover as the wizard. Inline
            handlers rather than Tailwind variants because the brand colour is a
            CSS custom property set per community, which arbitrary variants
            cannot read at build time. */}
        <button
          type="button"
          onClick={() => openTier("__new__")}
          onMouseEnter={(e) => {
            const b = "var(--brand-color, #b8336a)";
            e.currentTarget.style.color = b;
            e.currentTarget.style.borderColor = "color-mix(in srgb, var(--brand-color, #b8336a) 35%, transparent)";
            e.currentTarget.style.background = "color-mix(in srgb, var(--brand-color, #b8336a) 6%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "";
            e.currentTarget.style.borderColor = "";
            e.currentTarget.style.background = "";
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[13px] font-medium text-zinc-500 border border-dashed border-zinc-200 rounded-xl cursor-pointer transition-all duration-150"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add ticket type
        </button>
        </>
        )}
      </div>

      <div>
        <DonationsSection
          donation={donation}
          onUpdate={updateDonation}
          defaultCurrency={tiers[0]?.products?.currency || "EUR"}
        />
        {/* Its own Save, because donations persist through their own endpoint
            and not with the tiers. Appears only once something changed: a
            permanently-enabled Save invites a write that would send a cleared
            config for a host who came only to look. */}
        {canEdit && donationDirty && (
          <div className="flex justify-end pt-3">
            <button
              type="button"
              onClick={saveDonation}
              disabled={savingDonation}
              className="px-4 py-2 text-[13px] font-medium rounded-lg cursor-pointer disabled:opacity-40"
              style={{ background: theme.brand, color: theme.onBrand }}
            >
              {savingDonation ? "Saving..." : "Save donations"}
            </button>
          </div>
        )}
      </div>

      {editingTier && (
        <PriceEditModal
          event={event}
          communityTag={communityTag}
          onClose={close}
          onSaved={saved}
          showToast={showToast}
          /* Straight to the tier's editor, skipping the modal's own list —
             the list is this page now. "__new__" appends a blank tier and
             opens it, which is what the wizard's Add does. */
          openTierLocalId={editingTier === "__new__" ? undefined : editingTier}
          openNewTier={editingTier === "__new__"}
          /* Member pricing is community-owned-only: segments are
             community-scoped and MemberPricingService rejects overrides on a
             personal event. Gated on ownership, exactly as DetailsView does,
             because this view is shared between both host apps. */
          showMemberPricing={!!event?.communityId}
        />
      )}
    </div>
  );
}
