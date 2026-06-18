"use client";

/**
 * Per-event listings panel — rendered inline on the event Overview /
 * /manage page.
 *
 * Shows every active community listing for the event (one row per
 * community in event_communities). Each row has inline per-listing
 * controls (Show / Hide / Remove / Withdraw) and the section header
 * carries an "Add Listing" button that opens a community-picker modal
 * — driven by the optional `availableCommunities` prop. When the prop
 * is omitted, the Add button is hidden (community-app /manage doesn't
 * surface cross-community-listing onboarding to members; admin app
 * passes its `useAuth().hubs` mapped to this shape).
 *
 * Endpoints used (all pre-existing):
 *   GET    /api/event-listings/event/:eventId
 *   PATCH  /api/event-listings/:id/visibility       { isHidden }
 *   PATCH  /api/event-listings/:id/status           { status: 'CANCELLED' }
 *   POST   /api/event-listings/self-list            { eventId, communityTag }
 *   POST   /api/event-listings/request              { eventId, communityTag, commissionRate? }
 *
 * The Hide / Show toggle is non-destructive (no confirm). Remove /
 * Withdraw open a confirm modal — Remove copy flags the per-community
 * refund scope when the event is paid and the listing was live.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useEventManagementConfig, useJsonHeaders } from "../../config";

interface Listing {
  id: string;
  eventId: string;
  communityId: string;
  status: string;
  isSelfListing: boolean;
  isHidden: boolean;
  createdAt: string;
  community?: { id: string; name: string; communityTag: string; iconUrl: string | null };
  ticketListing?: { id: string; commissionRate: number } | null;
}

export interface AvailableCommunity {
  communityTag: string;
  communityName: string;
  communityIconUrl?: string | null;
  /** When true the community-leader path is used (instant ACTIVE listing).
   *  When false the member-submission path is used (PENDING listing with
   *  an optional commission slider for paid events). */
  isLeader: boolean;
}

export interface EventListingsSectionProps {
  event: any;
  /**
   * Communities this caller can list the event in. Each entry becomes a
   * row in the "Add Listing" picker — leader entries get an instant
   * "Add" CTA, non-leader entries get "Request" + commission slider for
   * paid events. Omit to hide the Add button entirely (e.g. community-
   * app /manage where members don't manage cross-community listings).
   */
  availableCommunities?: AvailableCommunity[];
  /** Refresh the event payload upstream after a listing mutates. */
  onUpdate: () => void;
  showToast: (msg: string) => void;
}

type RowAction =
  | { kind: "remove"; listingId: string; communityName: string; hasMoney: boolean }
  | { kind: "withdraw"; listingId: string; communityName: string }
  | null;

export function EventListingsSection({
  event,
  availableCommunities,
  onUpdate,
  showToast,
}: EventListingsSectionProps) {
  const { apiBaseUrl, authHeaders } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowSaving, setRowSaving] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<RowAction>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<"search" | "commission">("search");
  const [pendingCommunity, setPendingCommunity] = useState<AvailableCommunity | null>(null);
  const [commission, setCommission] = useState(10);
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => { if (event?.id) void fetchListings(event.id); }, [event?.id]);

  async function fetchListings(id: string) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/event-listings/event/${id}`, { headers: authHeaders() });
      if (res.ok) setListings(await res.json());
    } catch { /* */ }
    finally { setLoading(false); }
  }

  function refresh() { if (event?.id) void fetchListings(event.id); onUpdate(); }

  const isPast = event?.endDate ? new Date(event.endDate) < new Date() : false;
  const isPaid = event?.price > 0;
  const activeListings = listings.filter(l => l.status !== "CANCELLED");

  async function setVisibility(listing: Listing, isHidden: boolean) {
    setRowSaving(listing.id);
    try {
      const res = await fetch(`${apiBaseUrl}/api/event-listings/${listing.id}/visibility`, {
        method: "PATCH", headers: jsonHeaders(), body: JSON.stringify({ isHidden }),
      });
      if (res.ok) {
        showToast(isHidden ? "Listing hidden" : "Listing visible");
        refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.details?.join(". ") || err.error || (isHidden ? "Failed to hide" : "Failed to show"));
      }
    } catch { showToast(isHidden ? "Failed to hide" : "Failed to show"); }
    finally { setRowSaving(null); }
  }

  async function executePendingAction() {
    const action = pendingAction;
    if (!action) return;
    setPendingAction(null);
    setRowSaving(action.listingId);
    try {
      const res = await fetch(`${apiBaseUrl}/api/event-listings/${action.listingId}/status`, {
        method: "PATCH", headers: jsonHeaders(), body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (res.ok) {
        showToast(action.kind === "withdraw" ? "Submission withdrawn" : "Listing removed");
        refresh();
      } else { showToast(action.kind === "withdraw" ? "Failed to withdraw" : "Failed to remove"); }
    } catch { showToast(action.kind === "withdraw" ? "Failed to withdraw" : "Failed to remove"); }
    finally { setRowSaving(null); }
  }

  // "Add Listing" modal data — partitions availableCommunities into
  // leader-instant vs member-submission slots, filtering out anything
  // already attached to the event.
  const addedTags = new Set(activeListings.map(l => l.community?.communityTag?.toLowerCase()).filter(Boolean));
  const candidateCommunities = (availableCommunities || [])
    .filter(c => !addedTags.has(c.communityTag.toLowerCase()));
  const leaderCommunities = candidateCommunities.filter(c => c.isLeader);
  const memberCommunities = candidateCommunities.filter(c => !c.isLeader);
  const showAddButton = !isPast && (availableCommunities?.length ?? 0) > 0;

  async function handleLeaderAdd(c: AvailableCommunity) {
    setAddSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/event-listings/self-list`, {
        method: "POST", headers: jsonHeaders(),
        body: JSON.stringify({ eventId: event.id, communityTag: c.communityTag }),
      });
      if (res.ok) { showToast("Added to " + c.communityName); refresh(); setShowAddModal(false); }
      else { const err = await res.json().catch(() => ({})); showToast(err.error || "Failed to list"); }
    } catch { showToast("Failed to list"); }
    finally { setAddSaving(false); }
  }

  async function handleMemberAdd(c: AvailableCommunity) {
    if (isPaid) { setPendingCommunity(c); setCommission(10); setAddMode("commission"); }
    else { await submitRequest(c.communityTag, undefined); }
  }

  async function submitRequest(tag: string, rate: number | undefined) {
    setAddSaving(true);
    try {
      const body: Record<string, unknown> = { eventId: event.id, communityTag: tag };
      if (rate !== undefined) body.commissionRate = rate;
      const res = await fetch(`${apiBaseUrl}/api/event-listings/request`, {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify(body),
      });
      if (res.ok) {
        showToast("Listing request sent");
        refresh();
        setShowAddModal(false);
        setPendingCommunity(null);
        setAddMode("search");
      } else { const err = await res.json().catch(() => ({})); showToast(err.error || "Failed to request"); }
    } catch { showToast("Failed to request"); }
    finally { setAddSaving(false); }
  }

  function getStatusConfig(l: Listing) {
    if (l.status === "ACTIVE" && l.isHidden) return { label: "Hidden", dot: "bg-amber-500" };
    if (l.status === "ACTIVE") return { label: "Live", dot: "bg-emerald-500" };
    if (l.status === "PENDING") return { label: "Pending", dot: "bg-amber-500" };
    if (l.status === "PAUSED") return { label: "Paused", dot: "bg-zinc-400" };
    return { label: "Cancelled", dot: "bg-red-500" };
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-900">Listings</h2>
          <p className="text-[12px] text-zinc-400 mt-0.5">Where this event appears across cobuntu communities.</p>
        </div>
        {showAddButton && (
          <button onClick={() => { setAddMode("search"); setPendingCommunity(null); setShowAddModal(true); }}
            className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer">
            Add Listing
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
        {/* 2026-06-18: dropped the inner "Listed on (N)" header — the
            outer "Listings" header above already names this surface,
            and the row count is implicit in the rendered list. */}
        {loading ? (
          <div className="p-5 space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-zinc-100 animate-pulse" />)}
          </div>
        ) : activeListings.length > 0 ? (
          activeListings.map((l) => {
            const sc = getStatusConfig(l);
            const saving = rowSaving === l.id;
            const isActiveLive = l.status === "ACTIVE" && !l.isHidden;
            const isActiveHidden = l.status === "ACTIVE" && l.isHidden;
            const isPending = l.status === "PENDING";
            return (
              <div key={l.id} className="flex items-center gap-3 px-6 py-3.5 border-b border-zinc-100 last:border-none">
                {l.community?.iconUrl ? (
                  <img src={l.community.iconUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-[13px] font-semibold text-zinc-500 shrink-0">{l.community?.name?.[0] || "?"}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 truncate">{l.community?.name || "Community"}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {isPaid ? (l.isSelfListing ? "No commission" : `${l.ticketListing?.commissionRate ?? 0}% commission`) : "Free"}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium shrink-0 ${
                  l.status === "ACTIVE" && !l.isHidden ? "bg-emerald-50 text-emerald-700" :
                  l.status === "ACTIVE" && l.isHidden ? "bg-zinc-100 text-zinc-600" :
                  l.status === "PENDING" ? "bg-amber-50 text-amber-700" :
                  l.status === "PAUSED" ? "bg-zinc-100 text-zinc-500" :
                  "bg-red-50 text-red-600"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                  {sc.label}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {isActiveLive && (
                    <button onClick={() => setVisibility(l, true)} disabled={saving}
                      className="px-3 py-1.5 text-[12px] font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-30 cursor-pointer">
                      Hide
                    </button>
                  )}
                  {isActiveHidden && (
                    <button onClick={() => setVisibility(l, false)} disabled={saving}
                      className="px-3 py-1.5 text-[12px] font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer">
                      Show
                    </button>
                  )}
                  {(isActiveLive || isActiveHidden) && (
                    <button
                      onClick={() => setPendingAction({
                        kind: "remove",
                        listingId: l.id,
                        communityName: l.community?.name || "this community",
                        // Paid event with attendees on a live listing →
                        // real refund risk. Hidden listings can still
                        // carry orphan attendees but the practical case
                        // is live.
                        hasMoney: isPaid && isActiveLive,
                      })}
                      disabled={saving}
                      className="px-3 py-1.5 text-[12px] font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-30 cursor-pointer">
                      Remove
                    </button>
                  )}
                  {isPending && (
                    <button
                      onClick={() => setPendingAction({
                        kind: "withdraw",
                        listingId: l.id,
                        communityName: l.community?.name || "this community",
                      })}
                      disabled={saving}
                      className="px-3 py-1.5 text-[12px] font-medium text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 disabled:opacity-30 cursor-pointer">
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-6 py-12 text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-zinc-200 mb-3"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <p className="text-sm text-zinc-500">Not listed on any community yet</p>
            <p className="text-xs text-zinc-400 mt-1">Add a listing to reach more people.</p>
          </div>
        )}
      </div>

      {/* Confirm modal for Remove / Withdraw — inlined here (the shared
          pkg doesn't bundle a generic ConfirmDialog yet; each consuming
          app has its own variant). */}
      {pendingAction && createPortal(
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setPendingAction(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[calc(100vw-2rem)] md:w-[420px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-3">
              <h3 className="text-[15px] font-semibold text-zinc-900">
                {pendingAction.kind === "remove" ? "Remove listing?" : "Withdraw submission?"}
              </h3>
              <p className="text-[13px] text-zinc-500 mt-2">
                {pendingAction.kind === "remove"
                  ? pendingAction.hasMoney
                    ? `This event will stop being promoted on ${pendingAction.communityName}. Any tickets sold through that community will be refunded and those attendees will be notified.`
                    : `This event will stop being promoted on ${pendingAction.communityName}. Attendees from that community will be notified.`
                  : `Your request to list on ${pendingAction.communityName} will be withdrawn.`}
              </p>
            </div>
            <div className="px-6 py-4 flex gap-2 justify-end border-t border-zinc-100">
              <button onClick={() => setPendingAction(null)}
                className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">
                Cancel
              </button>
              <button onClick={executePendingAction}
                className={`px-4 py-2 text-[13px] font-medium text-white rounded-lg cursor-pointer ${
                  pendingAction.kind === "remove" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
                }`}>
                {pendingAction.kind === "remove" ? "Remove" : "Withdraw"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showAddModal && addMode === "search" && createPortal(
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[calc(100vw-2rem)] md:w-[480px] h-[520px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-zinc-900">List in Community</h3>
                  <p className="text-[12px] text-zinc-400 mt-0.5">Choose where to list your event.</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center cursor-pointer shrink-0 -mt-1 -mr-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto border-t border-zinc-100">
              {leaderCommunities.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider px-6 pt-4 pb-2">Your communities</p>
                  {leaderCommunities.map((c) => (
                    <button key={c.communityTag} onClick={() => handleLeaderAdd(c)} disabled={addSaving}
                      className="w-full flex items-center gap-3 px-6 py-3.5 hover:bg-zinc-50 cursor-pointer text-left disabled:opacity-50 transition-colors">
                      {c.communityIconUrl ? (
                        <img src={c.communityIconUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-[12px] font-semibold text-zinc-500 shrink-0">{c.communityName[0]}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900">{c.communityName}</p>
                        <p className="text-[12px] text-emerald-500 flex items-center gap-1 mt-0.5">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                          Instant — no approval needed
                        </p>
                      </div>
                      <div className="shrink-0 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-[11px] font-medium">Add</div>
                    </button>
                  ))}
                </div>
              )}
              {memberCommunities.length > 0 && (
                <div>
                  {leaderCommunities.length > 0 && <div className="h-px bg-zinc-100 mx-6" />}
                  <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider px-6 pt-4 pb-2">Member of</p>
                  {memberCommunities.map((c) => (
                    <button key={c.communityTag} onClick={() => handleMemberAdd(c)} disabled={addSaving}
                      className="w-full flex items-center gap-3 px-6 py-3.5 hover:bg-zinc-50 cursor-pointer text-left disabled:opacity-50 transition-colors">
                      {c.communityIconUrl ? (
                        <img src={c.communityIconUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-[12px] font-semibold text-zinc-500 shrink-0">{c.communityName[0]}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900">{c.communityName}</p>
                        <p className="text-[12px] text-zinc-400 flex items-center gap-1 mt-0.5">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          Requires approval
                        </p>
                      </div>
                      <div className="shrink-0 px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 text-[11px] font-medium">Request</div>
                    </button>
                  ))}
                </div>
              )}
              {leaderCommunities.length === 0 && memberCommunities.length === 0 && (
                <div className="px-6 py-10 text-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-zinc-200 mb-3"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  <p className="text-sm text-zinc-500">Already listed everywhere</p>
                  <p className="text-xs text-zinc-400 mt-1">This event is listed in all your communities.</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showAddModal && addMode === "commission" && pendingCommunity && createPortal(
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => { setAddMode("search"); setPendingCommunity(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-[calc(100vw-2rem)] md:w-[420px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                {pendingCommunity.communityIconUrl ? (
                  <img src={pendingCommunity.communityIconUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-[12px] font-semibold text-zinc-500 shrink-0">{pendingCommunity.communityName[0]}</div>
                )}
                <div>
                  <p className="text-[15px] font-semibold text-zinc-900">{pendingCommunity.communityName}</p>
                  <p className="text-[12px] text-zinc-400 flex items-center gap-1 mt-0.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Requires approval from community leaders
                  </p>
                </div>
              </div>
              <button onClick={() => { setAddMode("search"); setPendingCommunity(null); }} className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center cursor-pointer shrink-0 -mt-1 -mr-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="px-6 py-5 border-t border-zinc-100">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-medium text-zinc-700">Commission rate</span>
                <span className="text-[15px] font-semibold text-zinc-900 tabular-nums bg-zinc-100 px-2.5 py-0.5 rounded-lg">{commission}%</span>
              </div>
              <input type="range" min={0} max={50} step={1} value={commission} onChange={e => setCommission(Number(e.target.value))}
                className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-zinc-900" />
              <div className="flex justify-between mt-1.5">
                <span className="text-[11px] text-zinc-400">0%</span>
                <span className="text-[11px] text-zinc-400">50%</span>
              </div>
              <p className="text-[12px] text-zinc-400 mt-3">Percentage the community takes from each ticket sale.</p>
            </div>

            <div className="px-6 py-4 border-t border-zinc-100 flex gap-2">
              <button onClick={() => { setAddMode("search"); setPendingCommunity(null); }} disabled={addSaving}
                className="flex-1 px-4 py-2.5 text-[13px] text-zinc-500 border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer disabled:opacity-40">Back</button>
              <button onClick={() => submitRequest(pendingCommunity.communityTag, commission)} disabled={addSaving}
                className="flex-1 px-4 py-2.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer disabled:opacity-40">
                {addSaving ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
