"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
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
  loadDonationFromEvent,
  toDisplay,
  validateDonation,
  validateTier,
} from "./PriceEditModal/helpers";
import { SortableTierCard } from "./PriceEditModal/TierCard";
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
  event: any;
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
}

export function PriceEditModal({ event, communityTag, onClose, onSaved, showToast, showMemberPricing }: PriceEditModalProps) {
  const { apiBaseUrl, authHeaders } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const stripe = useStripeStatus(communityTag);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftTier[]>([]);
  const [originalTiers, setOriginalTiers] = useState<Map<string, OriginalTierSnapshot>>(new Map());
  const [saving, setSaving] = useState(false);
  // Notify-attendees confirmation states — mirrors EditEventDrawer so the
  // host gets the same prompt shape when they edit ticket pricing/name.
  // 'hidden' = no dialog; 'options' = prompt; loading/success/error are
  // intermediate states while the save runs.
  const [confirmState, setConfirmState] = useState<"hidden" | "options" | "loading" | "success" | "error">("hidden");
  const [confirmError, setConfirmError] = useState("");
  // Donation sidecar — loaded from event.donationConfig, saved separately.
  // donationDirty tracks whether the host changed anything so we skip the
  // PUT when nothing changed.
  const [donation, setDonation] = useState<DonationDraft>(() => loadDonationFromEvent(event));
  const [donationDirty, setDonationDirty] = useState(false);

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
            };
          }));
          setOriginalTiers(snapshot);
        }
      } catch { setDrafts([blankTier()]); }
      finally { setLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, communityTag, apiBaseUrl]);

  // Fetch community segments once when the modal opens with
  // showMemberPricing on. Segments are community-wide; one fetch covers
  // every tier's section.
  useEffect(() => {
    if (!showMemberPricing) return;
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

  if (!loading && stripe.loading === false && !stripe.chargesEnabled && hasPaid) {
    return <StripeRequiredWarning communityTag={communityTag} onClose={onClose} />;
  }

  async function onSaveClicked() {
    // If there's at least one existing tier with a material change, ask
    // the host whether to notify enrolled attendees. Otherwise just save.
    if (findTiersWithMaterialChanges(drafts, originalTiers).length > 0) {
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
      onSaved();
    } catch (e: any) {
      // When the caller is the confirm modal it wants the exception so it
      // can switch into its error state. The plain Save button path catches
      // it here and surfaces a toast — same behavior as before.
      if (opts.suppressFinalToast) {
        throw e;
      }
      showToast(e.message || "Failed to save");
    }
    finally { setSaving(false); }
  }

  const isEmpty = drafts.every(t => t.deleted) || (drafts.length === 1 && !drafts[0].id && !drafts[0].price);
  const title = isEmpty ? "Add pricing" : visible.length === 1 ? "Edit pricing" : "Pricing tiers";

  return (
    <>
    <ModalShell onClose={onClose} width="w-[600px]">
      {/* ─── Header ─── */}
      <div className="mb-5">
        <h3 className="text-[16px] font-semibold text-zinc-900">{title}</h3>
        <p className="text-[12px] text-zinc-500 mt-0.5">
          Tickets, donations, and per-tier registration forms.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-[13px] text-zinc-400">Loading…</div>
      ) : (
        // Scroll is owned by the outer ModalShell now (the shared shell's
        // body sets overflow-y-auto + a fixed max-height). The old inner
        // `max-h-[68vh] overflow-y-auto` here was a pre-shell stopgap that
        // capped the tier list to ~68vh inside a 90vh shell — wasting ~22vh
        // and creating nested scroll containers. Just space the rows now.
        <div className="space-y-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visible.map(t => t.localId)} strategy={verticalListSortingStrategy}>
              {visible.map(t => (
                <SortableTierCard
                  key={t.localId}
                  t={t}
                  communityTag={communityTag}
                  canDelete={visible.length > 1}
                  canDuplicate={!!t.id}
                  onUpdate={patch => updateDraft(t._idx, patch)}
                  onRemove={() => removeTier(t._idx)}
                  onDuplicate={() => duplicateTier(t._idx)}
                  onToggle={() => toggleExpand(t._idx)}
                  showMemberPricing={!!showMemberPricing}
                  showToast={showToast}
                  memberPricingState={t.id ? memberPricingByTier.get(t.id) : undefined}
                  onMemberPricingRowChange={(idx, patch) => t.id && updateMemberPricingRow(t.id, idx, patch)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add tier */}
          <button
            onClick={addTier}
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

      {/* ─── Footer ─── */}
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-zinc-100">
        <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer">Cancel</button>
        <button onClick={onSaveClicked} disabled={saving || loading}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer transition-colors">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
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
