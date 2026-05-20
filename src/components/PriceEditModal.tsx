"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, Plus, FileText, ChevronDown, Lock, GripVertical, Copy } from "lucide-react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ModalShell } from "../ui/modal-shell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useEventManagementConfig, useJsonHeaders } from "../config";
import { useStripeStatus, StripeRequiredWarning } from "./stripe-status";
import { MemberPricingSection, type MemberPricingSectionHandle } from "./MemberPricingSection";
import {
  SUPPORTED_CURRENCIES,
  type DonationDraft,
  type DraftTier,
  type OriginalTierSnapshot,
  type Tier,
} from "./PriceEditModal/types";
import {
  blankDonation,
  blankTier,
  buildDonationBody,
  buildTierBody,
  findTiersWithMaterialChanges,
  fromSmallestUnit,
  getSymbol,
  hasPaidTier,
  isTierLocked,
  loadDonationFromEvent,
  toDisplay,
  toSmallestUnit,
  validateDonation,
  validateTier,
} from "./PriceEditModal/helpers";

/**
 * Single source of truth for ticket-tier management on an event.
 *
 * Canonical for both `cobuntu-admin` (community-leader-facing) and
 * `cobuntu-community-app` (event-host-facing /manage). API base URL +
 * Authorization header come from `EventManagementConfigProvider`; the
 * "edit registration form" navigation is injected via `onOpenTierForm`
 * because the two apps have different URL patterns for it.
 *
 * Tier rows render compact by default (name + price + delete) and expand
 * inline to reveal the editor (description, price, currency, capacity,
 * per-tier form). Brand-new (unsaved) rows auto-expand.
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
   * Optional. Called when the host clicks "Edit registration form" on a
   * tier. Each consumer app has a different URL pattern for the form
   * editor (admin uses a query param; community-app uses a sub-route),
   * so the navigation is injected. If omitted, the button toasts that
   * form editing is unavailable in this surface.
   */
  onOpenTierForm?: (tierId: string) => void;
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

export function PriceEditModal({ event, communityTag, onClose, onSaved, showToast, onOpenTierForm, showMemberPricing }: PriceEditModalProps) {
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
  // Imperative refs to each mounted MemberPricingSection (keyed by tier
  // id — only saved tiers mount the section). The global save() walks
  // these after tier writes succeed so member-pricing overrides commit
  // under the same Save button. Replaces the nested per-section Save
  // button the UX redesign flagged as dual-Save confusion.
  const memberPricingRefs = useRef<Map<string, MemberPricingSectionHandle | null>>(new Map());

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

  function openTierForm(tierId: string | undefined) {
    if (!tierId) { showToast("Save the tier first to add a form"); return; }
    if (onOpenTierForm) {
      onOpenTierForm(tierId);
    } else {
      showToast("Form editing not available in this surface");
    }
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

      // Commit member-pricing overrides via the imperative refs the
      // tier cards register on mount. Each mounted section writes its
      // own dirty rows; the parent never threads the override payloads
      // through the tier save loop (the backend exposes them as a
      // separate sub-resource). Done AFTER tier writes so brand-new
      // tiers — which can't have overrides until their POST returns a
      // tier id — aren't a concern (the section unmounts/remounts on
      // re-fetch). Failures bubble up into the same catch as tier
      // failures, surfacing the same toast / confirm-state-machine
      // error path.
      for (const [, handle] of memberPricingRefs.current) {
        if (handle && handle.isDirty()) {
          await handle.commit();
        }
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
        <div className="space-y-3 max-h-[68vh] overflow-y-auto pr-1 -mr-1">
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
                  onOpenForm={() => openTierForm(t.id)}
                  showMemberPricing={!!showMemberPricing}
                  showToast={showToast}
                  registerMemberPricingRef={(tierId, handle) => {
                    if (handle) memberPricingRefs.current.set(tierId, handle);
                    else memberPricingRefs.current.delete(tierId);
                  }}
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

// ─── Sortable wrapper (dnd-kit) ──────────────────────────────────────────

/**
 * Adapter that gives TierCard the dnd-kit hooks. Keeps TierCard itself
 * presentation-only — it only knows it has a drag handle to render.
 */
function SortableTierCard(props: TierCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.t.localId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}>
      <TierCard {...props} dragAttributes={attributes} dragListeners={listeners} />
    </div>
  );
}

// ─── Per-tier card ───────────────────────────────────────────────────────

interface TierCardProps {
  t: DraftTier & { _idx: number };
  communityTag: string;
  canDelete: boolean;
  canDuplicate: boolean;
  onUpdate: (patch: Partial<DraftTier>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
  onOpenForm: () => void;
  /** Render MemberPricingSection inside the expanded body. Community-
   *  only — admin sets true, community-app /manage omits. */
  showMemberPricing: boolean;
  showToast: (msg: string) => void;
  /** Imperative ref registration so the outer modal can call
   *  commit()/isDirty() on this tier's MemberPricingSection during its
   *  global Save loop. Called on mount with the handle, on unmount
   *  with null. */
  registerMemberPricingRef?: (tierId: string, handle: MemberPricingSectionHandle | null) => void;
  dragAttributes?: any;
  dragListeners?: any;
}

function TierCard({ t, communityTag, canDelete, canDuplicate, onUpdate, onRemove, onDuplicate, onToggle, onOpenForm, showMemberPricing, showToast, registerMemberPricingRef, dragAttributes, dragListeners }: TierCardProps) {
  const sym = getSymbol(t.currency);
  const locked = isTierLocked(t);
  const capCap = t.capacity ? parseInt(t.capacity, 10) : null;
  const soldLabel = locked
    ? capCap != null
      ? `${t.salesCount}/${capCap}`
      : `${t.salesCount} sold`
    : null;
  return (
    <div className="group rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Compact header row — name on the left, price summary on the right, expand chevron + delete */}
      <div className="flex items-center gap-2 px-4 py-3">
        {/* Drag handle — appears on hover. Skip when there's nothing else to drag against. */}
        {dragListeners && (
          <button
            type="button"
            aria-label="Drag to reorder"
            className="p-1 -ml-2 -my-1 text-zinc-300 hover:text-zinc-600 cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            {...dragAttributes}
            {...dragListeners}
            onClick={e => e.preventDefault()}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={t.expanded ? "Collapse" : "Expand"}
          className="p-1 -m-1 text-zinc-400 hover:text-zinc-700 cursor-pointer transition-colors shrink-0"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${t.expanded ? "" : "-rotate-90"}`} />
        </button>
        <input
          type="text"
          value={t.name}
          onChange={e => onUpdate({ name: e.target.value })}
          placeholder="Tier name"
          className="flex-1 min-w-0 px-0 py-1 text-[14px] font-semibold text-zinc-900 placeholder:text-zinc-400 bg-transparent border-0 focus:outline-none focus:ring-0"
        />
        {/* Badges */}
        {t.hasForm && (
          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">Form</span>
        )}
        {t.priceMode === "pwyw" && (
          <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full shrink-0">PWYW</span>
        )}
        {/* Compact summary when collapsed: price + sold count if any */}
        {!t.expanded && (
          <span className="flex items-center gap-2 shrink-0">
            {soldLabel && (
              <span className="text-[11px] font-medium text-zinc-500 tabular-nums">{soldLabel}</span>
            )}
            <span className="text-[13px] font-semibold text-zinc-700 tabular-nums">
              {t.price && parseFloat(t.price) > 0 ? `${sym}${t.price}` : "Free"}
            </span>
          </span>
        )}
        {canDuplicate && (
          <button
            onClick={onDuplicate}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 cursor-pointer rounded-md hover:bg-zinc-100 transition-colors shrink-0"
            title="Duplicate tier"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            onClick={onRemove}
            className="p-1.5 text-zinc-400 hover:text-red-500 cursor-pointer rounded-md hover:bg-red-50 transition-colors shrink-0"
            title="Remove tier"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expanded body — wrapped in Collapse for smooth height-auto animation */}
      <Collapse open={t.expanded}>
        <div className="border-t border-zinc-100">
          {/* Lock banner — shown when paid attendees exist on this tier */}
          {locked && (
            <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-50/70 border-b border-amber-100">
              <Lock className="w-3.5 h-3.5 mt-0.5 text-amber-600 shrink-0" />
              <p className="text-[12px] text-amber-700">
                <span className="font-medium">{t.salesCount} ticket{t.salesCount !== 1 ? "s" : ""} sold</span>
                {" — price and currency are locked. Refund all sales first to change them."}
              </p>
            </div>
          )}

          {/* Description */}
          <div className="px-4 pt-3 pb-2">
            <Eyebrow>Description</Eyebrow>
            <input
              type="text"
              value={t.description}
              onChange={e => onUpdate({ description: e.target.value })}
              placeholder="What's included (optional)"
              className="w-full mt-1 px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
            />
          </div>

          {/* Pricing model: fixed vs pay-what-you-want. PWYW means the tier's
              listed price is a placeholder — buyer chooses an amount above
              the optional minimum at checkout. Locked once paid attendees
              exist (server-side too). */}
          <div className="px-4 pt-3 pb-1">
            <Eyebrow>Pricing model</Eyebrow>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => !locked && onUpdate({ priceMode: "fixed" })}
                disabled={locked}
                className={`px-3 py-2 text-[13px] rounded-lg border transition-colors ${t.priceMode === "fixed" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"} ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              >Fixed price</button>
              <button
                type="button"
                onClick={() => !locked && onUpdate({ priceMode: "pwyw" })}
                disabled={locked}
                className={`px-3 py-2 text-[13px] rounded-lg border transition-colors ${t.priceMode === "pwyw" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"} ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              >Pay what you want</button>
            </div>
            {t.priceMode === "pwyw" && (
              <p className="text-[11px] text-zinc-500 mt-1.5">
                Buyer chooses the amount at checkout. The price below acts as a suggested default.
              </p>
            )}
          </div>

          {/* Price / Currency / Capacity */}
          <div className="grid grid-cols-[1fr_110px_100px] gap-2.5 px-4 py-2">
            <div>
              <Eyebrow>{t.priceMode === "pwyw" ? "Suggested price" : "Price"}</Eyebrow>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">{sym}</span>
                <input
                  type="number" min="0" step="0.01" value={t.price}
                  onChange={e => onUpdate({ price: e.target.value })}
                  placeholder="0.00"
                  disabled={locked}
                  title={locked ? "Refund all sales first to change price" : undefined}
                  className={`w-full pl-7 pr-3 py-2 text-[13px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : "text-zinc-900"}`}
                />
              </div>
            </div>
            <div>
              <Eyebrow>Currency</Eyebrow>
              <Select value={t.currency} onValueChange={v => onUpdate({ currency: v })} disabled={locked}>
                <SelectTrigger className={`h-[38px] mt-1 text-[13px] ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : ""}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="text-zinc-500 mr-1">{c.symbol}</span>{c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Eyebrow>Capacity</Eyebrow>
              <input
                type="number" min={locked ? t.salesCount : 0} step="1" value={t.capacity}
                onChange={e => onUpdate({ capacity: e.target.value })}
                placeholder="∞"
                className="w-full mt-1 px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-300 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              {locked && (
                <p className="text-[10px] text-zinc-400 mt-1">Min {t.salesCount} (already sold)</p>
              )}
            </div>
          </div>

          {/* PWYW minimum (only when priceMode is pwyw). Optional. */}
          <Collapse open={t.priceMode === "pwyw"}>
            <div className="px-4 pb-2">
              <Eyebrow>Minimum amount (optional)</Eyebrow>
              <div className="relative mt-1 max-w-[220px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">{sym}</span>
                <input
                  type="number" min="0" step="0.01" value={t.pwywMin}
                  onChange={e => onUpdate({ pwywMin: e.target.value })}
                  placeholder="No minimum"
                  disabled={locked}
                  className={`w-full pl-7 pr-3 py-2 text-[13px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : "text-zinc-900"}`}
                />
              </div>
            </div>
          </Collapse>

          {/* Installment plan — opt-in toggle + 3 inputs (events skip
              accessDurationMonths; event date bounds access). Backend
              enforces three-or-none + range bounds; the same checks
              run client-side in save() so the host sees inline errors.
              Locked once paid attendees exist — server-side too. */}
          <div className="px-4 pt-3 pb-2 border-t border-zinc-100">
            <label className={`flex items-center gap-2 ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked={t.installmentEnabled}
                disabled={locked}
                onChange={e => onUpdate({ installmentEnabled: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 disabled:cursor-not-allowed"
              />
              <span className={`text-[12px] font-medium ${locked ? "text-zinc-400" : "text-zinc-700"}`}>
                Offer an installment plan
              </span>
            </label>
            <p className="text-[11px] text-zinc-500 mt-1">
              Let buyers pay this tier in equal monthly charges instead of one upfront payment.
            </p>
            <Collapse open={t.installmentEnabled}>
              <div className="grid grid-cols-3 gap-2.5 mt-2">
                <div>
                  <Eyebrow>Total ({sym})</Eyebrow>
                  <input
                    type="number" min="0" step="0.01" value={t.installmentTotal}
                    onChange={e => onUpdate({ installmentTotal: e.target.value })}
                    placeholder="300"
                    disabled={locked}
                    className={`w-full mt-1 px-3 py-2 text-[13px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : "text-zinc-900"}`}
                  />
                </div>
                <div>
                  <Eyebrow>Charges</Eyebrow>
                  <input
                    type="number" min="2" step="1" value={t.installmentCount}
                    onChange={e => onUpdate({ installmentCount: e.target.value })}
                    placeholder="3"
                    disabled={locked}
                    className={`w-full mt-1 px-3 py-2 text-[13px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : "text-zinc-900"}`}
                  />
                </div>
                <div>
                  <Eyebrow>Every (months)</Eyebrow>
                  <input
                    type="number" min="1" step="1" value={t.installmentInterval}
                    onChange={e => onUpdate({ installmentInterval: e.target.value })}
                    placeholder="1"
                    disabled={locked}
                    className={`w-full mt-1 px-3 py-2 text-[13px] border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${locked ? "text-zinc-400 bg-zinc-50 cursor-not-allowed" : "text-zinc-900"}`}
                  />
                </div>
              </div>
              {t.installmentEnabled
                && t.installmentTotal
                && t.installmentCount
                && parseInt(t.installmentCount, 10) >= 2 && (
                <p className="text-[11px] text-zinc-500 mt-1.5">
                  Buyer pays {sym}{(parseFloat(t.installmentTotal) / parseInt(t.installmentCount, 10)).toFixed(2)} every {t.installmentInterval || "1"} month{(t.installmentInterval || "1") !== "1" ? "s" : ""} for {t.installmentCount} charges.
                </p>
              )}
            </Collapse>
            {locked && t.installmentEnabled && (
              <p className="text-[10px] text-amber-600 mt-1">
                Installment plan is locked while tickets are sold. Refund all sales first to change.
              </p>
            )}
          </div>

          {/* Member pricing — community-only, saved-tiers only. The
              section fetches its own data + commits per-row on its own
              Save button, so it doesn't thread through the outer modal
              save loop. Unsaved drafts (no `t.id`) skip it entirely
              since the backend needs a real tier id. */}
          {showMemberPricing && t.id && (
            <MemberPricingSection
              ref={(handle) => {
                // Only saved tiers mount this — id is stable for the
                // section's lifetime. Register on mount, unregister
                // on unmount so the outer modal's ref map doesn't
                // pin a stale handle after a tier delete.
                registerMemberPricingRef?.(t.id!, handle);
              }}
              communityTag={communityTag}
              tierId={t.id}
              currencyCode={t.currency}
              currencySymbol={sym}
              showToast={showToast}
            />
          )}

          {/* Form footer */}
          <button
            type="button"
            onClick={onOpenForm}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 border-t border-zinc-100 bg-zinc-50/60 text-left hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!t.id}
            title={!t.id ? "Save this tier first to add a form" : undefined}
          >
            <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-zinc-700">
                Registration form
                {t.hasForm && (
                  <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    {t.formFieldCount} field{t.formFieldCount !== 1 ? "s" : ""} · Linked
                  </span>
                )}
                {!t.id && t.sourceTierId && (
                  <span className="ml-1.5 text-[10px] font-semibold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">Copying from {t.sourceTierName || "source"}</span>
                )}
              </p>
              <p className="text-[11px] text-zinc-400 truncate">
                {!t.id && t.sourceTierId
                  ? `Form will copy from "${t.sourceTierName || "source tier"}" when you save`
                  : t.hasForm
                    ? "Edit the questions attendees fill out at this tier"
                    : t.id
                      ? "Add custom questions for attendees at this tier"
                      : "Save tier to add a form"}
              </p>
            </div>
            <span className="text-[11px] font-medium text-zinc-500 shrink-0">{t.hasForm ? "Manage →" : "Add →"}</span>
          </button>
        </div>
      </Collapse>
    </div>
  );
}

// ─── Small UI primitives used inside the tier card ──────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider block">{children}</label>;
}

/**
 * Collapse — animates height-auto reveals using the grid-template-rows
 * 0fr/1fr trick. No measurement, no JS, no dependency. The inner div has
 * overflow-hidden so children clip during the transition.
 *
 * Usage: <Collapse open={someBool}>...</Collapse>
 */
function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

// ─── Donations section ───────────────────────────────────────────────

interface DonationsSectionProps {
  donation: DonationDraft;
  onUpdate: (patch: Partial<DonationDraft>) => void;
  defaultCurrency: string;
}

/**
 * Sidecar donation config (saved separately from tiers via PUT /donations).
 * Two modes:
 *   - Suggested amounts: chip list. Buyer picks one at checkout.
 *   - Pay-what-you-want (PWYW): buyer enters any amount; optional minimum.
 * Currency follows the tier currency by default — if it diverges, hosts
 * can override. (Currency override is intentionally simple here; deeper
 * cross-currency donation logic can come later.)
 */
function DonationsSection({ donation, onUpdate, defaultCurrency }: DonationsSectionProps) {
  const sym = getSymbol(donation.currency || defaultCurrency);

  function addAmount() {
    onUpdate({ amounts: [...donation.amounts, ""] });
  }
  function updateAmount(idx: number, value: string) {
    const next = [...donation.amounts];
    next[idx] = value;
    onUpdate({ amounts: next });
  }
  function removeAmount(idx: number) {
    onUpdate({ amounts: donation.amounts.filter((_, i) => i !== idx) });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-zinc-100">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900">Donations</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Optional add-on at checkout. Independent of tiers — same prompt regardless of which tier the buyer picks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onUpdate({ enabled: !donation.enabled })}
          className={`relative shrink-0 rounded-full cursor-pointer transition-colors duration-200 ease-out ${donation.enabled ? "bg-zinc-900" : "bg-zinc-200"}`}
          style={{ width: 38, height: 22 }}
          aria-pressed={donation.enabled}
          aria-label="Toggle donations"
        >
          <span
            className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out"
            style={{ transform: donation.enabled ? "translateX(18px)" : "translateX(2px)" }}
          />
        </button>
      </div>

      <Collapse open={donation.enabled}>
        <div className="px-4 py-3 space-y-3">
          {/* Mode */}
          <div>
            <Eyebrow>Mode</Eyebrow>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => onUpdate({ mode: "fixed" })}
                className={`px-3 py-2 text-[13px] rounded-lg border cursor-pointer transition-colors ${donation.mode === "fixed" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
              >Suggested amounts</button>
              <button
                type="button"
                onClick={() => onUpdate({ mode: "pwyw" })}
                className={`px-3 py-2 text-[13px] rounded-lg border cursor-pointer transition-colors ${donation.mode === "pwyw" ? "border-zinc-900 bg-zinc-50 text-zinc-900 font-medium" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
              >Pay what you want</button>
            </div>
          </div>

          {/* Fixed: chip list */}
          <Collapse open={donation.mode === "fixed"}>
            <div>
              <Eyebrow>Suggested amounts</Eyebrow>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {donation.amounts.map((a, i) => (
                  <div key={i} className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-zinc-400 pointer-events-none">{sym}</span>
                    <input
                      type="number" min="0" step="0.01" value={a}
                      onChange={e => updateAmount(i, e.target.value)}
                      placeholder="10"
                      className="w-[88px] pl-6 pr-7 py-1.5 text-[13px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {donation.amounts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAmount(i)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-zinc-300 hover:text-red-500 cursor-pointer"
                        aria-label="Remove amount"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                {donation.amounts.length < 8 && (
                  <button
                    type="button"
                    onClick={addAmount}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-zinc-500 border border-dashed border-zinc-300 rounded-lg hover:border-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                )}
              </div>
            </div>
          </Collapse>

          {/* PWYW: optional minimum */}
          <Collapse open={donation.mode === "pwyw"}>
            <div>
              <Eyebrow>Minimum (optional)</Eyebrow>
              <div className="relative max-w-[220px] mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">{sym}</span>
                <input
                  type="number" min="0" step="0.01" value={donation.minAmount}
                  onChange={e => onUpdate({ minAmount: e.target.value })}
                  placeholder="No minimum"
                  className="w-full pl-7 pr-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </Collapse>
        </div>
      </Collapse>
    </div>
  );
}
