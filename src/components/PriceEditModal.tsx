"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ModalShell } from "../ui/modal-shell";
import { useEventManagementConfig, useJsonHeaders } from "../config";
import { useStripeStatus, StripeRequiredWarning } from "./stripe-status";
import {
  type DonationDraft,
  type DraftTier,
  type OriginalTierSnapshot,
  type Tier,
} from "./PriceEditModal/types";
import {
  blankTier,
  buildDonationBody,
  buildTierBody,
  findTiersWithMaterialChanges,
  fromSmallestUnit,
  hasPaidTier,
  isTierLocked,
  loadDonationFromEvent,
  toDisplay,
  validateDonation,
  validateTier,
} from "./PriceEditModal/helpers";
import { SortableTierRow } from "./PriceEditModal/TierRow";
import { Switch, StepFade } from "./PriceEditModal/_primitives";
import { STEP_TITLES, STEP_SUBTITLES, type StepId } from "./PriceEditModal/TierHubView";
import { TierEditView } from "./PriceEditModal/TierEditView";
import { StepView } from "./PriceEditModal/StepView";
import { FooterSlotContext } from "./PriceEditModal/footer-slot";
import { DonationsSection } from "./PriceEditModal/DonationsSection";
import {
  buildRowsFromOverrides,
  buildUpsertBody,
  findFirstValidationError,
  resetRowsBaseline,
  rowIsDirty,
  type CommunitySegment,
  type MemberPricingRow,
  type MemberPricingTierState,
} from "./PriceEditModal/member-pricing";

/**
 * Single source of truth for ticket-tier management on an event.
 *
 * Canonical for both `cobuntu-admin` (community-leader-facing) and
 * `cobuntu-community-app` (event-host-facing /manage). API base URL +
 * Authorization header come from `EventManagementConfigProvider`. The
 * tier registration form builder is hosted inline inside the modal
 * (see ./PriceEditModal/steps/FormStep.tsx) — no external navigation
 * callback is required from consumers.
 *
 * Tier rows render compact by default (name + price + delete) and
 * expand into the redesigned EditHub (4 SectionCards → step navigation).
 * Brand-new (unsaved) rows auto-expand.
 *
 * Donations are configured separately, NOT per tier. The Donations section
 * below the tier list saves a sidecar config to the event itself
 * (event.donationConfig). The old "Optional donation tier" model has been
 * removed — see services/finances/src/modules/checkout/donationConfigValidation.ts
 * for the new shape.
 *
 * Recurring (isRecurring/recurringInterval) is intentionally NOT exposed
 * here either — events checkout runs Stripe in mode: 'payment', so a
 * recurring event would silently no-op. Marketplace products handle
 * recurring; events do not.
 */

// Currency table, currency conversion helpers, blank-row builders, and
// the Tier / DraftTier / DonationDraft shapes live in
// ./PriceEditModal/types.ts + ./PriceEditModal/helpers.ts. Imported
// above. The standalone helper tests exercise them in isolation —
// see src/__tests__/PriceEditModal.helpers.test.ts.

export interface PriceEditModalProps {
  /** Required outside draftMode. In draftMode `event.id` is unused —
   *  pass null/omit; `event.donationConfig` may still be passed if the
   *  caller wants to seed the donation section. */
  event?: any;
  communityTag: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
  /**
   * When true, the MemberPricingSection is rendered inside each tier
   * card's expanded body — letting community admins configure per-
   * segment discount overrides for this tier. Community-only feature;
   * admin app passes true (admin only edits community-owned events),
   * community-app `/manage` omits / passes false (user-owned events
   * don't get the section).
   *
   * Default: false. The section requires saved-tier ids to call the
   * backend; rows are hidden for unsaved drafts (no `id`).
   */
  showMemberPricing?: boolean;
  /**
   * Draft mode — no fetches on mount, no backend writes on Save. Used
   * by create-event flows where the event doesn't exist yet, so the
   * parent owns the draft state and posts it as part of the
   * create-event payload. The modal stays purely presentational.
   *
   * In draftMode:
   *   - No GET /tiers (initialDraftTiers seeds drafts instead)
   *   - No GET /stripe/connected (gate happens at parent's submit time)
   *   - No GET /tiers/:id/form (no saved tier ids exist)
   *   - Member-pricing + Form section Edit buttons stay disabled
   *     ("Save tier first" copy already covers this naturally)
   *   - On Save: validate locally, then call onDraftCommit instead of
   *     POSTing
   *   - Notify-attendees prompt never fires (no enrolled attendees)
   */
  draftMode?: boolean;
  /** Initial drafts (from parent's form state). draftMode only. */
  initialDraftTiers?: DraftTier[];
  /** Initial donation (from parent's form state). draftMode only. */
  initialDraftDonation?: DonationDraft;
  /** Called on Save in draftMode. Parent persists the result in its
   *  own form state. Modal then closes via onSaved. */
  onDraftCommit?: (payload: { tiers: DraftTier[]; donation: DonationDraft }) => void;
  /**
   * Open the modal straight on a tier's EDIT screen (Level 2), skipping the
   * list — the tier list now lives inline in the form. Pass the tapped tier's
   * localId (edit) or a freshly-appended blank tier's localId (add). When set,
   * backing out of Level 2 closes the modal instead of returning to the list.
   */
  openTierLocalId?: string;
}

export function PriceEditModal({
  event,
  communityTag,
  onClose,
  onSaved,
  showToast,
  showMemberPricing,
  draftMode,
  initialDraftTiers,
  initialDraftDonation,
  onDraftCommit,
  openTierLocalId,
}: PriceEditModalProps) {
  const { apiBaseUrl, authHeaders } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const stripe = useStripeStatus(communityTag, { enabled: !draftMode });
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftTier[]>([]);
  const [originalTiers, setOriginalTiers] = useState<Map<string, OriginalTierSnapshot>>(new Map());
  const [saving, setSaving] = useState(false);
  /**
   * Why the modal keeps its own error state instead of relying on showToast:
   * consumers were passing stubs. EventForm passed a console.warn and
   * ProductForm passed `() => {}`, so a failed Save was invisible — the user
   * pressed Save, validation threw "Price required", the message went nowhere
   * and nothing on screen changed. Reported 2026-08-08 against the product
   * form; identical here. A modal has to be able to explain its own refusal
   * without depending on the host app wiring something up.
   */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishToggling, setPublishToggling] = useState(false);
  // Notify-attendees confirmation states — mirrors EditEventDrawer so the
  // host gets the same prompt shape when they edit ticket pricing/name.
  // 'hidden' = no dialog; 'options' = prompt; loading/success/error are
  // intermediate states while the save runs.
  const [confirmState, setConfirmState] = useState<"hidden" | "options" | "loading" | "success" | "error">("hidden");
  const [confirmError, setConfirmError] = useState("");
  // Donation sidecar — loaded from event.donationConfig, saved separately.
  // donationDirty tracks whether the host changed anything so we skip the
  // PUT when nothing changed. In draftMode, parent owns the seed.
  const [donation, setDonation] = useState<DonationDraft>(() =>
    draftMode && initialDraftDonation ? initialDraftDonation : loadDonationFromEvent(event),
  );
  const [donationDirty, setDonationDirty] = useState(false);

  // Three-level navigation state. Each non-null value escalates the
  // modal body to a "takeover" view:
  //   activeTier=null, activeStep=null      → Level 1 (tier list)
  //   activeTier=localId, activeStep=null   → Level 2 (per-tier hub)
  //   activeTier=localId, activeStep=basics → Level 3 (focused step)
  // Lifted out of the per-card EditHub component so siblings, Add Tier,
  // and Donations actually disappear when the user steps into a tier
  // (matching the user's mental model of "click tier → enter its
  // details").
  const [activeTier, setActiveTier] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<StepId | null>(null);

  // Opened directly on a tier from the form's inline list: jump to Level 2
  // (edit screen) once drafts have loaded, once. `openedDirect` also tells the
  // Level-2 back action to CLOSE the modal (the list lives in the form) rather
  // than pop to the in-modal list.
  const openedDirect = !!openTierLocalId;
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (openTierLocalId && !loading && !jumpedRef.current) {
      jumpedRef.current = true;
      setActiveTier(openTierLocalId);
    }
  }, [openTierLocalId, loading]);

  // Footer "step actions" slot. A step that owns primary actions (the
  // form builder's "+ Question" etc.) portals its buttons into this DOM
  // node so the footer stays the modal's single action bar — no buttons
  // scattered through the body. Null until the footer mounts.
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null);

  // Member-pricing state — lifted out of MemberPricingSection so it
  // survives tier-card collapse / hub↔step navigation / any unmount.
  // Tied to the modal's lifetime, not the section's. Segments are
  // community-wide (fetched once); per-tier overrides live in the
  // map below keyed by tier id.
  const [memberPricingSegments, setMemberPricingSegments] = useState<CommunitySegment[]>([]);
  const [memberPricingByTier, setMemberPricingByTier] = useState<Map<string, MemberPricingTierState>>(new Map());

  // Stable per-tier row-change handler. Each section receives a bound
  // version via getMemberPricingHandlers(tierId) below. Identity stable
  // across renders so React doesn't churn the section's props.
  const updateMemberPricingRow = useCallback(
    (tierId: string, idx: number, patch: Partial<MemberPricingRow>) => {
      setMemberPricingByTier((prev) => {
        const tierState = prev.get(tierId);
        if (!tierState || tierState.loading || tierState.error) return prev;
        const newRows = tierState.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
        const next = new Map(prev);
        next.set(tierId, { loading: false, error: null, rows: newRows });
        return next;
      });
    },
    [],
  );

  function updateDonation(patch: Partial<DonationDraft>) {
    setDonationDirty(true);
    setDonation(d => ({ ...d, ...patch }));
  }

  useEffect(() => {
    // Draft mode: parent owns the source of truth. No fetches; seed
    // drafts from initialDraftTiers (or a single blank tier).
    if (draftMode) {
      setDrafts(
        initialDraftTiers && initialDraftTiers.length > 0
          ? initialDraftTiers
          : [blankTier()],
      );
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const tierRes = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/tiers`, { headers: authHeaders() });
        const tiers: Tier[] = tierRes.ok ? await tierRes.json() : [];
        if (tiers.length === 0) {
          setDrafts([blankTier()]);
        } else {
          // Probe each tier's form in parallel — there's no batch endpoint, so
          // we fetch /tiers/:id/form individually. 200 with a body = linked,
          // 404 or empty = not linked.
          const formChecks = await Promise.all(
            tiers.map(t => fetch(`${apiBaseUrl}/api/communities/${communityTag}/tiers/${t.id}/form`, { headers: authHeaders() })
              .then(async r => r.ok ? await r.json().catch(() => null) : null)
              .catch(() => null)),
          );
          const snapshot = new Map<string, OriginalTierSnapshot>();
          setDrafts(tiers.map((t, i) => {
            const fields = formChecks[i]?.formData?.fields || formChecks[i]?.fields || [];
            const priceDisplay = String(toDisplay(t.products.price, t.products.currency));
            snapshot.set(t.id, { name: t.name, price: priceDisplay, currency: t.products.currency });
            return {
              localId: t.id,   // saved tiers reuse their backend id as the dnd key
              id: t.id,
              name: t.name,
              description: t.description || "",
              price: priceDisplay,
              currency: t.products.currency,
              capacity: t.capacity != null ? String(t.capacity) : "",
              hasForm: fields.length > 0,
              formFieldCount: fields.length,
              salesCount: typeof t.salesCount === "number" ? t.salesCount : 0,
              priceMode: t.priceMode === "pwyw" ? "pwyw" : "fixed",
              pwywMin: t.pwywMinAmount != null ? fromSmallestUnit(t.pwywMinAmount, t.products.currency) : "",
              installmentEnabled: t.products.installmentTotalPrice != null,
              installmentTotal: t.products.installmentTotalPrice != null ? fromSmallestUnit(t.products.installmentTotalPrice, t.products.currency) : "",
              installmentCount: t.products.installmentCount != null ? String(t.products.installmentCount) : "",
              installmentInterval: t.products.installmentIntervalMonths != null ? String(t.products.installmentIntervalMonths) : "1",
              expanded: false,
              // Publish + auto-schedule. Saved tiers preserve their existing
              // publishedAt timestamp so unrelated edits don't overwrite the
              // original publish moment. Draft tiers (publishedAt: null)
              // come through as the off-toggle state. Window bounds map
              // straight to the datetime-local-compatible ISO strings.
              publishedAt: t.publishedAt ?? null,
              autoScheduleEnabled: !!t.autoScheduleEnabled,
              salesStartAt: t.salesStartAt ?? "",
              salesEndAt: t.salesEndAt ?? "",
            };
          }));
          setOriginalTiers(snapshot);
        }
      } catch { setDrafts([blankTier()]); }
      finally { setLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, communityTag, apiBaseUrl, draftMode]);

  // Fetch community segments once when the modal opens with
  // showMemberPricing on. Segments are community-wide; one fetch covers
  // every tier's section. Skipped in draftMode — Member pricing Edit
  // is disabled on unsaved tiers, so there's no UI that needs them.
  useEffect(() => {
    if (!showMemberPricing || draftMode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/api/communities/${communityTag}/segments`,
          { headers: authHeaders() },
        );
        if (cancelled || !res.ok) return;
        const segments: CommunitySegment[] = await res.json();
        setMemberPricingSegments(segments);
      } catch { /* silent — sections will show "No segments yet" */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMemberPricing, communityTag, apiBaseUrl]);

  // Once segments are loaded, fetch overrides for each saved tier and
  // populate the per-tier state map. Lazy per-tier: only fires for
  // tiers that don't already have a slot. Subsequent renders (e.g.
  // new tier saved) re-trigger only the new tier's fetch.
  useEffect(() => {
    if (!showMemberPricing || memberPricingSegments.length === 0) return;
    const savedTierIds = drafts
      .filter((d) => d.id && !d.deleted)
      .map((d) => d.id!) as string[];
    for (const tierId of savedTierIds) {
      if (memberPricingByTier.has(tierId)) continue;
      // Mark loading immediately so the section shows the loading hint.
      setMemberPricingByTier((prev) => {
        const next = new Map(prev);
        next.set(tierId, { loading: true, error: null, rows: [] as never[] });
        return next;
      });
      const tier = drafts.find((d) => d.id === tierId);
      const currency = tier?.currency ?? "EUR";
      (async () => {
        try {
          const res = await fetch(
            `${apiBaseUrl}/api/communities/${communityTag}/tiers/${tierId}/member-pricing`,
            { headers: authHeaders() },
          );
          const overrides: any[] = res.ok ? await res.json() : [];
          const rows = buildRowsFromOverrides(memberPricingSegments, overrides, currency);
          setMemberPricingByTier((prev) => {
            const next = new Map(prev);
            next.set(tierId, { loading: false, error: null, rows });
            return next;
          });
        } catch (e: any) {
          setMemberPricingByTier((prev) => {
            const next = new Map(prev);
            next.set(tierId, { loading: false, error: e?.message || "Failed to load", rows: [] as never[] });
            return next;
          });
        }
      })();
    }
  // The drafts dep tracks the saved-tier id set; mapping to a join key
  // keeps the effect from firing on every keystroke that mutates other
  // draft fields.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMemberPricing, memberPricingSegments, drafts.map((d) => d.id).join(",")]);

  function updateDraft(idx: number, patch: Partial<DraftTier>) {
    setDrafts(d => d.map((t, i) => i === idx ? { ...t, ...patch } : t));
  }

  /**
   * Per-tier publish toggle for the L2 (tier-hub) footer. Publishing is a
   * top-level rollout action, so the Switch hits the backend IMMEDIATELY
   * (no Save): a saved tier PUTs { publishedAt } — an ISO string to
   * publish, null to unpublish (the endpoint's explicit-clear contract).
   * The draft flips optimistically and reverts if the request fails. A
   * brand-new (unsaved) tier has no id to PUT against, so the toggle just
   * stages publishedAt on the draft; it persists on the tier's first save.
   */
  async function togglePublish(idx: number) {
    const tier = drafts[idx];
    if (!tier) return;
    const prevPublishedAt = tier.publishedAt;
    const nextPublishedAt = tier.publishedAt ? null : new Date().toISOString();
    updateDraft(idx, { publishedAt: nextPublishedAt });
    if (!tier.id) return; // unsaved → persists when the tier is first saved
    setPublishToggling(true);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/tiers/${tier.id}`,
        { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ publishedAt: nextPublishedAt }) },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to update publish state");
      }
      showToast(nextPublishedAt ? "Tier published" : "Tier unpublished");
    } catch (e: any) {
      updateDraft(idx, { publishedAt: prevPublishedAt }); // revert optimistic flip
      showToast(e.message || "Failed to update publish state");
    } finally {
      setPublishToggling(false);
    }
  }
  function addTier() {
    setDrafts(d => {
      const visibleCount = d.filter(x => !x.deleted).length;
      return [...d, blankTier(d[0]?.currency || "EUR", visibleCount + 1)];
    });
  }
  function removeTier(idx: number) {
    setDrafts(d => {
      const t = d[idx];
      if (!t.id) return d.filter((_, i) => i !== idx); // unsaved → just drop
      return d.map((x, i) => i === idx ? { ...x, deleted: true } : x); // existing → mark for delete
    });
  }
  function toggleExpand(idx: number) {
    updateDraft(idx, { expanded: !drafts[idx].expanded });
  }

  function duplicateTier(idx: number) {
    setDrafts(d => {
      const src = d[idx];
      if (!src) return d;
      const copy: DraftTier = {
        ...src,
        localId: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `local-${Math.random().toString(36).slice(2)}`,
        id: undefined,         // new tier — Save will POST a fresh row
        name: `${src.name || "Tier"} (copy)`,
        // Form will be cloned server-side on Save via copyFormFromTierId.
        // Mirror the source's hasForm/fieldCount so the user sees the form
        // pill on the copy immediately — saves a confused "is the form
        // coming?" moment. Backend creates the actual row.
        hasForm: src.hasForm,
        formFieldCount: src.formFieldCount,
        salesCount: 0,
        deleted: false,
        expanded: true,
        sourceTierId: src.id,
        sourceTierName: src.name,
      };
      const out = [...d];
      out.splice(idx + 1, 0, copy);
      return out;
    });
  }

  // ─── Drag-to-reorder (dnd-kit) ────────────────────────────────
  // PointerSensor with a small distance so a click on the drag handle still
  // works as a click (e.g. accidental presses don't immediately drag).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    // Reorder drafts in place (only the visible ones — deleted/hidden
    // entries keep their relative slot).
    const visibleLocalIds = drafts.filter(d => !d.deleted).map(d => d.localId);
    const oldIndex = visibleLocalIds.indexOf(active.id as string);
    const newIndex = visibleLocalIds.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;

    const previousDrafts = drafts;
    const reorderedVisible = [...visibleLocalIds];
    const [moved] = reorderedVisible.splice(oldIndex, 1);
    reorderedVisible.splice(newIndex, 0, moved);

    // Build the next drafts array preserving deleted rows in their original
    // positions and slotting the visible rows in the new order.
    const visibleQueue = reorderedVisible.map(lid => drafts.find(d => d.localId === lid)!);
    const next: DraftTier[] = [];
    for (const d of drafts) {
      if (d.deleted) next.push(d);
      else next.push(visibleQueue.shift()!);
    }
    setDrafts(next);

    // Persist immediately for already-saved tiers. Brand-new tiers are
    // ordered locally and will pick up their sortOrder when Save runs.
    const persistedTierIds = next.filter(d => !d.deleted && d.id).map(d => d.id!);
    if (persistedTierIds.length < 2) return;

    try {
      const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/tiers/reorder`, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ tierIds: persistedTierIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save new order");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to save new order");
      setDrafts(previousDrafts);   // revert on error
    }
  }

  const visible = drafts.map((t, idx) => ({ ...t, _idx: idx })).filter(t => !t.deleted);
  const hasPaid = hasPaidTier(drafts);

  // Member-pricing fetches are async per saved tier. If the host clicks
  // Save before any of them resolve, the save loop iterates an
  // incomplete map and silently omits per-tier overrides — the host's
  // intended config is dropped. We block Save until every saved tier
  // either has its rows loaded or has errored (errored slots are
  // skipped by the save loop, so they're safe to allow).
  //
  // Only matters when showMemberPricing is on; admin-only feature.
  // Brand-new (unsaved) tiers don't have a slot in the map and so
  // can't race — `id` filter below skips them.
  //
  // CRITICAL: gate on `memberPricingSegments.length > 0`. When a community has
  // NO segments the per-tier fetch effect returns early (nothing to fetch), so
  // `memberPricingByTier` never populates and a saved tier's state stays
  // undefined — which read as "still loading" forever, permanently DISABLING
  // Save (clicking it did nothing, no toast). With no segments there is nothing
  // to load or commit, so it must not be pending. (Every no-segment community
  // could not save event tiers.)
  const memberPricingPending = !!showMemberPricing && memberPricingSegments.length > 0 && drafts.some((d) => {
    if (!d.id || d.deleted) return false;
    const state = memberPricingByTier.get(d.id);
    return !state || state.loading;
  });

  // Stripe gate doesn't apply in draftMode — the parent's create-event
  // submit re-runs the check at the point the event actually goes live.
  if (!draftMode && !loading && stripe.loading === false && !stripe.chargesEnabled && hasPaid) {
    return <StripeRequiredWarning communityTag={communityTag} onClose={onClose} />;
  }

  async function onSaveClicked() {
    // In draftMode there's no notify-attendees prompt (no enrolled
    // attendees exist on an unsaved event). Skip straight to save().
    if (!draftMode && findTiersWithMaterialChanges(drafts, originalTiers).length > 0) {
      setConfirmState("options");
      return;
    }
    await save(false);
  }

  async function handleConfirmNotify(notifyAttendees: boolean) {
    setConfirmState("loading");
    try {
      await save(notifyAttendees, { suppressFinalToast: true });
      setConfirmState("success");
      setTimeout(() => setConfirmState("hidden"), 1500);
    } catch (e: any) {
      setConfirmError(e?.message || "Failed to save");
      setConfirmState("error");
      setTimeout(() => setConfirmState("hidden"), 2000);
    }
  }

  async function save(notifyAttendees: boolean = false, opts: { suppressFinalToast?: boolean } = {}) {
    setSaving(true);
    setSaveError(null);
    // Defer onSaved() until after we've cleared local state (setSaving,
    // any pending toast). The parent typically unmounts the modal in
    // response to onSaved, so calling it inline causes the toast call
    // + setSaving(false) to land on an unmounted component (warning +
    // the success toast never reaches the toast host because the modal
    // subtree it came from is gone). Hoisting onSaved to "after we're
    // done with our own setState" keeps the success toast visible.
    let onSavedPending = false;
    try {
      // Validate tiers — pure helper returns the first failure message,
      // or null when the draft is valid. Three-or-none installment rules
      // + pwyw min bounds live in helpers.ts so they're test-covered in
      // isolation (PriceEditModal.helpers.test.ts).
      for (const t of drafts.filter(x => !x.deleted)) {
        const err = validateTier(t);
        if (err) throw new Error(err);
      }

      const donationErr = validateDonation(donation);
      if (donationErr) throw new Error(donationErr);

      // Draft mode: hand the validated drafts to the parent and close.
      // No backend writes — the parent owns the source of truth and
      // will POST these as part of the create-event payload.
      if (draftMode) {
        const liveDrafts = drafts.filter((d) => !d.deleted);
        onDraftCommit?.({ tiers: liveDrafts, donation });
        if (!opts.suppressFinalToast) showToast("Pricing saved");
        onSavedPending = true;
      } else {

      // Apply: tier deletes, updates, creates. The notify-attendees flag is
      // only relevant on PUT updates of existing tiers (the only path the
      // backend honors it on); skip it for create/delete.
      for (const t of drafts) {
        if (t.deleted && t.id) {
          const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/tiers/${t.id}`, { method: "DELETE", headers: authHeaders() });
          if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Failed to delete "${t.name}"`); }
        } else if (t.id) {
          const body = buildTierBody(t, { notifyAttendees });
          const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/tiers/${t.id}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify(body) });
          if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Failed to update "${t.name}"`); }
        } else if (!t.deleted) {
          const body = buildTierBody(t);
          const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/tiers`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) });
          if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Failed to create "${t.name}"`); }
        }
      }

      // Commit member-pricing overrides from the modal-level state
      // map. The map outlives any tier-card unmount, so dirty rows
      // survive the user collapsing a tier between edit and Save.
      // Done AFTER tier writes so brand-new tiers — which can't have
      // overrides until their POST returns a tier id — aren't a
      // concern (we iterate by tierId; new tiers without an id don't
      // appear in the map).
      const memberPricingResets: Array<[string, MemberPricingRow[]]> = [];
      for (const [tierId, tierState] of memberPricingByTier) {
        if (tierState.loading || tierState.error) continue;
        const valErr = findFirstValidationError(tierState.rows);
        if (valErr) throw new Error(valErr);
        const dirtyRows = tierState.rows.filter(rowIsDirty);
        if (dirtyRows.length === 0) continue;

        const tier = drafts.find((d) => d.id === tierId);
        const currency = tier?.currency ?? "EUR";
        for (const r of dirtyRows) {
          // Disabled an existing override → DELETE.
          if (r.initial?.enabled && !r.enabled && r.initial.id) {
            const res = await fetch(
              `${apiBaseUrl}/api/communities/${communityTag}/tiers/${tierId}/member-pricing/${r.initial.id}`,
              { method: "DELETE", headers: authHeaders() },
            );
            if (!res.ok) {
              const e = await res.json().catch(() => ({}));
              throw new Error(e.error || `Failed to remove override for ${r.segmentName}`);
            }
            continue;
          }
          // Enabled (new or updated) → POST upsert. Backend dedupes by
          // (tierId, segmentId).
          if (r.enabled) {
            const body = buildUpsertBody(r, currency);
            const res = await fetch(
              `${apiBaseUrl}/api/communities/${communityTag}/tiers/${tierId}/member-pricing`,
              { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) },
            );
            if (!res.ok) {
              const e = await res.json().catch(() => ({}));
              throw new Error(e.error || `Failed to save override for ${r.segmentName}`);
            }
          }
        }
        memberPricingResets.push([tierId, resetRowsBaseline(tierState.rows)]);
      }
      // Reset dirty baselines once all writes succeed so subsequent
      // Save clicks don't redundantly POST the same rows.
      if (memberPricingResets.length > 0) {
        setMemberPricingByTier((prev) => {
          const next = new Map(prev);
          for (const [tierId, rows] of memberPricingResets) {
            next.set(tierId, { loading: false, error: null, rows });
          }
          return next;
        });
      }

      // Persist donation sidecar config (separate API call — independent of tiers).
      // PUT receives null when disabled so the backend clears server state.
      if (donationDirty) {
        const donationBody = buildDonationBody(donation, drafts[0]?.currency || "EUR");
        const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/donations`, {
          method: "PUT",
          headers: jsonHeaders(),
          body: JSON.stringify(donationBody),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || "Failed to save donation settings");
        }
      }

      if (!opts.suppressFinalToast) showToast("Pricing updated");
      onSavedPending = true;
      }
    } catch (e: any) {
      // When the caller is the confirm modal it wants the exception so it
      // can switch into its error state. The plain Save button path catches
      // it here and surfaces a toast — same behavior as before.
      const msg = e?.message || "Failed to save";
      // The confirm-modal caller wants the exception so it can switch into
      // its own error state; it renders the message itself, so setting ours
      // too would double-report.
      if (opts.suppressFinalToast) {
        throw e;
      }
      setSaveError(msg);
      showToast(msg);
    }
    finally { setSaving(false); }
    // onSaved() fires AFTER the finally cleanup so the parent's
    // unmount-the-modal reaction doesn't strand setSaving(false) on a
    // dead component. The toast already fired inside the try block
    // (before this point) so it reaches the toast host while the modal
    // is still mounted.
    if (onSavedPending) onSaved();
  }

  const isEmpty = drafts.every(t => t.deleted) || (drafts.length === 1 && !drafts[0].id && !drafts[0].price);

  // Active draft for Level 2 / 3 takeover views. Keyed by tier.localId
  // (NOT tier.id) so brand-new unsaved tiers (no backend id yet) work
  // the same way as saved ones.
  const activeDraft = activeTier
    ? drafts.find(d => d.localId === activeTier && !d.deleted)
    : null;

  // Adapter for the active tier's index — passed to onUpdate / onRemove
  // / onDuplicate at Levels 2 + 3. Looked up at click-time so a stale
  // index (e.g. after reorder) doesn't pin to the wrong draft.
  function activeIdx(): number | null {
    if (!activeDraft) return null;
    const idx = drafts.findIndex(d => d.localId === activeDraft.localId);
    return idx >= 0 ? idx : null;
  }

  // ─── Header model — ONE title + ONE subtitle per level, plus a
  // breadcrumb trail so the user always knows where they are and can hop
  // back. Previously each surface rendered its own heading (modal title +
  // step eyebrow + step h3 = three titles stacked); now the modal owns
  // the single source of truth and the steps render body-only.
  //
  //   L1 (tier list): no breadcrumb · title "Pricing tiers" / "Edit
  //                   pricing" / "Add pricing" · descriptive subtitle.
  //   L2 (tier hub):  breadcrumb [Pricing tiers] · title = tier name ·
  //                   subtitle "Choose what to configure".
  //   L3 (step):      breadcrumb [Pricing tiers › {tier}] · title =
  //                   STEP_TITLES[step] · subtitle = STEP_SUBTITLES[step].
  const tierName = activeDraft?.name?.trim() || "Untitled tier";
  const title =
    activeDraft && activeStep
      ? STEP_TITLES[activeStep]
      : activeDraft
        ? tierName
        : isEmpty
          ? "Add pricing"
          : visible.length === 1
            ? "Edit pricing"
            : "Pricing tiers";
  const subtitle =
    activeDraft && activeStep
      ? STEP_SUBTITLES[activeStep]
      : activeDraft
        ? "Buyers pick one tier at checkout."
        : "Tickets, donations, and per-tier registration forms.";

  // Breadcrumb segments — each is clickable except the last (current
  // level). L1 has none. Clicking a crumb pops navigation back to it.
  const crumbs: Array<{ label: string; onClick?: () => void }> = [];
  if (activeDraft) {
    // When opened directly on a tier (list lives in the form), the tier edit
    // screen is the root — no "Pricing tiers" crumb. From a sub-step, the only
    // crumb is the tier name (back to the edit screen).
    if (!openedDirect) {
      crumbs.push({
        label: "Pricing tiers",
        onClick: () => {
          setActiveStep(null);
          setActiveTier(null);
        },
      });
    }
    if (activeStep) {
      crumbs.push({ label: tierName, onClick: () => setActiveStep(null) });
    }
  }

  return (
    <>
    {/* Fixed WIDTH (w-[600px]); height VARIES with each step's content.
        The column caps at 78vh and the body scrolls past that, with the
        header + footer pinned (shrink-0) so the footer stays visible even
        when the body overflows. */}
    <ModalShell onClose={onClose} width="w-full sm:w-[600px]">
      <FooterSlotContext.Provider value={footerSlot}>
      <div className="relative flex flex-col max-h-[78vh]">
      {/* Circular close — muted bg, top-right of the modal. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute -top-1 -right-1 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors cursor-pointer"
      >
        <X className="h-[18px] w-[18px]" />
      </button>
      {/* ─── Header ─── ONE breadcrumb + ONE title + ONE subtitle. */}
      <div className="shrink-0 mb-4 pr-9">
        {crumbs.length > 0 && (
          <nav className="flex items-center flex-wrap gap-1 mb-1.5 text-[12px]" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-zinc-300" aria-hidden>›</span>}
                <button
                  type="button"
                  onClick={c.onClick}
                  className="text-zinc-500 hover:text-zinc-900 hover:underline cursor-pointer transition-colors"
                >
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
        )}
        <h3 className="text-[16px] font-semibold text-zinc-900">{title}</h3>
        {subtitle && (
          <p className="text-[12px] text-zinc-500 mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Body — the sole flexible region; scrolls when a level's content
          is taller than the fixed column. */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      {/* Cross-fade between levels/steps. Keyed on the current view so
          each navigation re-mounts and animates in (see StepFade). */}
      <StepFade stepKey={`${activeTier ?? "list"}:${activeStep ?? "hub"}:${loading ? "loading" : "ready"}`}>
      {loading ? (
        <div className="py-12 text-center text-[13px] text-zinc-400">Loading…</div>
      ) : activeDraft && activeStep ? (
        // Level 3: step takeover. Hides everything else — siblings,
        // Add Tier, Donations are all gone. Footer Back returns to L2.
        <StepView
          t={activeDraft}
          step={activeStep}
          communityTag={communityTag}
          onUpdate={(patch) => {
            const idx = activeIdx();
            if (idx != null) updateDraft(idx, patch);
          }}
          draftMode={!!draftMode}
          showMemberPricing={!!showMemberPricing}
          memberPricingState={activeDraft.id ? memberPricingByTier.get(activeDraft.id) : undefined}
          onMemberPricingRowChange={
            activeDraft.id
              ? (idx, patch) => updateMemberPricingRow(activeDraft.id!, idx, patch)
              : undefined
          }
          showToast={showToast}
        />
      ) : activeDraft ? (
        // Level 2: per-tier EDIT screen — name/description/pricing inline, the
        // rest as Advanced rows that drill into a sub-step (Level 3).
        <TierEditView
          t={activeDraft}
          onUpdate={(patch) => {
            const idx = activeIdx();
            if (idx != null) updateDraft(idx, patch);
          }}
          onEnterStep={(step) => setActiveStep(step)}
          showMemberPricing={!!showMemberPricing}
          memberPricingState={activeDraft.id ? memberPricingByTier.get(activeDraft.id) : undefined}
          onMemberPricingRowChange={
            activeDraft.id
              ? (idx, patch) => updateMemberPricingRow(activeDraft.id!, idx, patch)
              : undefined
          }
          showToast={showToast}
          onTogglePublish={() => {
            const idx = activeIdx();
            if (idx != null) togglePublish(idx);
          }}
          publishToggling={publishToggling}
          draftMode={draftMode}
        />
      ) : (
        // Level 1: default tier list. Add tier + Donations + Save.
        // Scroll is owned by the outer ModalShell (shared shell sets
        // overflow-y-auto + a fixed max-height).
        <div className="space-y-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visible.map(t => t.localId)} strategy={verticalListSortingStrategy}>
              {visible.map(t => (
                <SortableTierRow
                  key={t.localId}
                  t={t}
                  onSelect={() => setActiveTier(t.localId)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add tier — appends a draft AND auto-navigates into its
              hub view, matching the user's intent of "create + edit". */}
          <button
            onClick={() => {
              addTier();
              // After addTier updates drafts, the new tier sits at the
              // end. Use a microtask to read the next-state localId.
              setTimeout(() => {
                setDrafts(curr => {
                  const last = curr[curr.length - 1];
                  if (last) setActiveTier(last.localId);
                  return curr;
                });
              }, 0);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-3 text-[12px] font-medium text-zinc-500 border border-dashed border-zinc-300 rounded-xl hover:border-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add tier
          </button>

          {/* Donations sidecar — independent of tiers. Saved via PUT /donations
              alongside tier writes when changed. */}
          <DonationsSection
            donation={donation}
            onUpdate={updateDonation}
            defaultCurrency={drafts[0]?.currency || "EUR"}
          />
        </div>
      )}
      </StepFade>
      </div>

      {/* ─── Footer ─── Modal-level navigation + Save.
          L1 (tier list):   [Cancel]                           [Save]
          L2 (per-tier hub): [Back] [Delete] [Duplicate]       [Save]
          L3 (step):        [Back]                             [Save]
          Save always commits everything regardless of level.
          Back / Cancel / Delete / Duplicate live here so the action
          surface stays predictable across levels — no inline pill-shaped
          affordances inside the body. */}
      {saveError && (
        <div
          role="alert"
          className="shrink-0 mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700 ring-1 ring-red-100"
        >
          {saveError}
        </div>
      )}
      <div className="shrink-0 flex items-center gap-2 mt-4 pt-4 border-t border-zinc-100">
        {activeDraft && activeStep ? (
          <button
            type="button"
            onClick={() => setActiveStep(null)}
            className="px-4 py-2 text-[13px] font-medium text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer"
          >
            Back
          </button>
        ) : activeDraft ? (
          <>
            <button
              type="button"
              onClick={() => (openedDirect ? onClose() : setActiveTier(null))}
              className="px-4 py-2 text-[13px] font-medium text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer"
            >
              {openedDirect ? "Cancel" : "Back"}
            </button>
            {/* Delete is ALWAYS shown (no hiding features without
                explanation). When it can't proceed it says why via a toast
                instead of being hidden/disabled:
                  - locked tier (has sales) → refund-first message
                  - last/only tier → "an event needs at least one tier" */}
            <button
              type="button"
              onClick={() => {
                if (isTierLocked(activeDraft)) {
                  showToast("Refund all sales before deleting this tier.");
                  return;
                }
                if (visible.length <= 1) {
                  showToast("An event needs at least one tier — add another before deleting this one.");
                  return;
                }
                const idx = activeIdx();
                if (idx != null) {
                  removeTier(idx);
                  setActiveTier(null);
                }
              }}
              className="px-4 py-2 text-[13px] font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer transition-colors"
            >
              Delete
            </button>
            {activeDraft.id && (
              <button
                type="button"
                onClick={() => {
                  const idx = activeIdx();
                  if (idx != null) duplicateTier(idx);
                }}
                className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors"
              >
                Duplicate
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
          >
            Cancel
          </button>
        )}
        <div className="flex-1" />
        {/* Per-step action slot. Steps with their own primary actions
            (e.g. the form builder's "+ Question" / "+ Page break") portal
            their buttons in here so the footer is the modal's single
            action bar. `contents` → buttons sit directly in this flex row,
            left of Save. Empty (zero-width) for steps that don't use it. */}
        <div ref={setFooterSlot} className="contents" />
        {/* The Publish switch used to sit here, left of Save, as a bare
            control with nothing saying what it did. It now lives in the L2
            "Availability" section with an explanation — see TierEditView. */}
        {/* Save shows at every level now — L2 is a real edit screen (name,
            description, pricing inline), so it commits from here too. Save
            always commits the whole modal. */}
        <button
          type="button"
          onClick={onSaveClicked}
          disabled={saving || loading || memberPricingPending}
          title={memberPricingPending ? "Loading member pricing…" : undefined}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      </div>
      </FooterSlotContext.Provider>
    </ModalShell>

    {/* ─── Notify-attendees confirmation ─────────────────────────
        Shown when an existing tier's name or price changed. Mirrors the
        three-button prompt in EditEventDrawer so hosts get the same UX
        across event-edit and tier-edit.

        Portaled to document.body because the consuming surface (e.g.
        cobuntu-admin's event detail page) wraps content in a
        transformed container (ViewTransition uses translate-y for the
        crossfade). A non-`none` transform creates a containing block
        for `position: fixed` descendants, so without the portal this
        modal positions relative to the wrapper — and if the user is
        scrolled down, appears off-screen above the viewport. Reported
        by PBN (2026-05-19): "Save button does nothing on price." It
        was firing the prompt, but the prompt was invisible. */}
    {confirmState !== "hidden" && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-xl w-[calc(100vw-2rem)] md:w-[400px] p-6">
          {confirmState === "options" && (<>
            <h3 className="text-[15px] font-semibold text-zinc-900 mb-2">Update ticket pricing?</h3>
            <p className="text-[13px] text-zinc-500 mb-4">A ticket name or price changed. Email enrolled attendees so they see the update?</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => handleConfirmNotify(true)} className="w-full px-4 py-3 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer">Yes, notify attendees</button>
              <button onClick={() => handleConfirmNotify(false)} className="w-full px-4 py-3 text-[13px] font-medium border border-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-50 cursor-pointer">Yes, do not notify attendees</button>
              <button onClick={() => setConfirmState("hidden")} className="w-full px-4 py-3 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-50 cursor-pointer">No, cancel</button>
            </div>
          </>)}
          {confirmState === "loading" && (<div className="py-8 flex flex-col items-center gap-3"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><p className="text-sm text-zinc-500">Updating pricing...</p></div>)}
          {confirmState === "success" && (<div className="py-8 flex flex-col items-center gap-3"><div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg></div><h3 className="text-[15px] font-semibold text-zinc-900">Pricing Updated!</h3><p className="text-sm text-zinc-500">Changes saved successfully</p></div>)}
          {confirmState === "error" && (<div className="py-8 flex flex-col items-center gap-3"><div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div><h3 className="text-[15px] font-semibold text-zinc-900">Update Failed</h3><p className="text-sm text-zinc-500">{confirmError}</p></div>)}
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
