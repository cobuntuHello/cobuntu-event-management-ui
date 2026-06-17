"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useEventManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import { AttendeeDetailDrawer } from "./AttendeeDetailDrawer";
import { RefundSaleModal, SalesUiConfigProvider, type SaleRow } from "@cobuntu/sales-ui";

interface Props {
  event: any;
  communityTag: string;
  isPublished: boolean;
  isPast: boolean;
  refreshKey?: number;
  onInviteClick?: () => void;
  /**
   * Optional click handler for the "Add Attendees" header button. When
   * provided, replaces the legacy navigate-to-?view=add-attendees fallback
   * so the consumer can open its own modal/drawer inline. The fallback
   * stays for backwards-compat with callers that haven't migrated.
   */
  onAddClick?: () => void;
  /**
   * Optional URL slug (or id) for the event, available to the parent
   * before the `event` GET resolves. When supplied, the section fires
   * its supplementary fetches (invitations, stats, pending, sales) in
   * parallel with the parent's event fetch instead of waiting for it.
   * Cuts the load shape from `wave1 + wave2` down to `max(wave1, wave2)`.
   *
   * Falls back to `event.id` / `event.slug` once those become available
   * (no behaviour change for callers that haven't been updated).
   */
  eventIdOrSlug?: string;
  /**
   * Optional render slot inserted between (previously) the revenue KPIs
   * and the Attendees header. With the KPIs extracted to EventRevenueKPIs
   * (feat/manage-event-restructure), this slot now renders just above the
   * Attendees header. Used by cobuntu-admin to surface inline content;
   * undefined = nothing rendered.
   */
  belowRevenueSlot?: React.ReactNode;
  /**
   * Predicate that tells the per-attendee drawer whether to render the
   * "Promote to host" action. The consumer computes it from its own
   * auth context + the attendee's payment/host state. Returning false
   * (or omitting the prop) hides the action.
   */
  canPromoteAttendeeToHost?: (attendee: any) => boolean;
  /**
   * Called when the user clicks "Promote to host" inside the attendee
   * drawer. The consumer is expected to open a PromoteAttendeeModal
   * preselected to the given attendee.
   */
  onPromoteAttendeeFromDrawer?: (attendee: any) => void;
}

interface InvitationStats {
  totalInvited: number;
  pending: number;
  accepted: number;
  expired: number;
  cancelled: number;
  byInviter: { userId: string; name: string; profileImage: string | null; totalSent: number; accepted: number }[];
}

interface Invitation {
  id: string;
  email: string;
  status: string;
  invitedAt: string;
  invitedUser?: { id: string; name: string; usertag: string; profileImage?: string } | null;
}

type Tab = "approved" | "pending" | "rejected" | "cancelled" | "invitations";

const SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", BRL: "R$" };

export function AttendeesAndInvitationsSection({ event, communityTag, isPublished, isPast, refreshKey = 0, onInviteClick, onAddClick, eventIdOrSlug, belowRevenueSlot, canPromoteAttendeeToHost, onPromoteAttendeeFromDrawer }: Props) {
  const config = useEventManagementConfig();
  const API = config.apiBaseUrl;
  const authHeaders = config.authHeaders;
  // Pkg-portable avatar: consumer can inject; fall back to the
  // minimal initials primitive shipped with the pkg.
  const UserAvatar = config.UserAvatar ?? UserAvatarFallback;
  const eventId = event?.id || event?.slug;
  const requiresApproval = !!event?.requiresApproval;
  const isPaid = event?.price > 0;
  const currency = event?.currency || "EUR";

  const attendees = event?.attendees || [];
  const approved = attendees.filter((a: any) => !a.status || a.status === "APPROVED");
  const rejected = attendees.filter((a: any) => a.status === "REJECTED");
  // CANCELLED rows. Under the new Reserve-Before-Decide flow (2026-06-14)
  // the bucket covers buyer self-cancel from PENDING + admin removal +
  // (historical) 48h PAYMENT_TIMEOUT rows that the now-deprecated cron
  // produced before cutover. PENDING_PAYMENT is no longer produced; any
  // pre-cutover PENDING_PAYMENT rows still in flight get swept into
  // CANCELLED by the legacy cron and land here.
  const cancelled = attendees.filter((a: any) => a.status === "CANCELLED");

  const [tab, setTab] = useState<Tab>("approved");
  const [stats, setStats] = useState<InvitationStats | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [pendingAttendees, setPendingAttendees] = useState<any[]>([]);
  // Map buyerUserId → full sale row, so:
  //  (a) the KPI cards above the list can compute totals
  //  (b) the per-row Refund button can open RefundSaleModal with the
  //      full SaleRow shape the @cobuntu/sales-ui modal expects.
  // Phase H of host-refunds-and-sales-visibility (2026-05-25):
  // unified attendees+sales view replacing the prior duplicate sections.
  const [salesByBuyer, setSalesByBuyer] = useState<Map<string, SaleRow>>(new Map());
  const [refundSale, setRefundSale] = useState<SaleRow | null>(null);
  const [salesRefreshTick, setSalesRefreshTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [drawerAttendee, setDrawerAttendee] = useState<any | null>(null);
  const [toast, setToast] = useState("");

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  // The event-detail page used to do this serially:
  //   1. parent fetches /events/<id>  → renders OverviewView
  //   2. this section mounts          → fires invitations/stats + sales
  // wave-2 was bottlenecked behind wave-1 even though every wave-2
  // endpoint only needs the eventId/slug from the URL (NOT the
  // resolved event row). Splitting the fetches into two effects:
  //
  //   a) wave-2a — always-on. Fires on mount with the URL slug, in
  //      PARALLEL with the parent's event GET. invitations + stats
  //      don't depend on requiresApproval / isPaid so they can race
  //      wave-1.
  //   b) wave-2b — conditional (requiresApproval ⇒ /pending-attendees,
  //      isPaid ⇒ /sales). Waits for `event` to resolve since those
  //      flags come off it.
  //
  // Net shape: max(wave1, wave2a) + wave2b-if-needed, instead of
  // wave1 + (wave2a ‖ wave2b). For free events that's ~half the wait.
  // For paid+approval events it still helps because wave2a races
  // wave1 and the heavy /sales fires immediately after wave1.
  //
  // `loading` flips false ONLY when the always-on fetches return —
  // the conditional ones manage their own state inline.
  const lookupId = eventIdOrSlug || event?.id || event?.slug;
  useEffect(() => {
    if (!lookupId || !communityTag) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [statsRes, invRes] = await Promise.all([
          fetch(`${API}/api/communities/${communityTag}/events/${lookupId}/invitations/stats`, { headers: authHeaders() }),
          fetch(`${API}/api/communities/${communityTag}/events/${lookupId}/invitations`, { headers: authHeaders() }),
        ]);
        if (cancelled) return;
        if (statsRes.ok) setStats(await statsRes.json());
        if (invRes.ok) {
          const data = await invRes.json();
          setInvitations(data.invitations || []);
        }
      } catch { /* */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [lookupId, communityTag, refreshKey]);

  // wave-2b — depends on resolved event flags. Fires the moment the
  // parent's event GET lands; never blocks wave-2a.
  useEffect(() => {
    if (!event?.id || !communityTag) return;
    if (!requiresApproval && !isPaid) return;
    let cancelled = false;
    (async () => {
      try {
        const fetches: Promise<Response>[] = [];
        if (requiresApproval) {
          fetches.push(fetch(`${API}/api/communities/${communityTag}/events/${event.id}/pending-attendees`, { headers: authHeaders() }));
        }
        if (isPaid) {
          fetches.push(fetch(`${API}/api/communities/${communityTag}/sales?timeRange=1y`, { headers: authHeaders() }));
        }
        const responses = await Promise.all(fetches);
        if (cancelled) return;

        let idx = 0;
        if (requiresApproval) {
          if (responses[idx]?.ok) setPendingAttendees(await responses[idx].json());
          idx++;
        }
        if (isPaid) {
          if (responses[idx]?.ok) {
            const salesData = await responses[idx].json();
            // Map is keyed under TWO surfaces so we can look up a sale
            // for both authed and guest attendees:
            //   - "uid:<buyerUserId>" — set when the buyer is an authed
            //     user. Lookup site below uses `a.user?.id`.
            //   - "em:<lowercased email>" — set unconditionally on every
            //     paid sale (every sale has an email — guest sales have
            //     ONLY this, no buyerUserId). Lookup falls back to
            //     `a.email` for guest attendees.
            // Pre-fix the filter required `s.buyer?.id`, which dropped
            // every guest sale on the floor — those attendees rendered
            // as "Comp" and the KPI cards undercounted. Real incident
            // 2026-06-07: ana@barrosmakers.com paid €24 to PBN's
            // Startup Founders' Night but showed up as Comp.
            const map = new Map<string, SaleRow>();
            for (const s of (salesData.sales || [])) {
              if (s.eventId !== event.id) continue;
              if (s.refundStatus !== "NONE") continue;
              const buyerEmail: string | null = s.buyer?.email ?? s.buyerEmail ?? null;
              if (!s.buyer?.id && !buyerEmail) continue;
              const row: SaleRow = {
                id: s.id,
                createdAt: s.createdAt,
                eventId: s.eventId ?? null,
                productSnapshot: null,
                buyer: {
                  id: s.buyer?.id ?? "",
                  name: s.buyer?.name ?? null,
                  usertag: s.buyer?.usertag ?? null,
                },
                buyerEmail,
                grossAmount: s.grossAmount,
                ownerNetPayout: s.ownerNetPayout,
                platformFee: s.platformFee,
                stripeFees: s.stripeFees ?? 0,
                stripeTaxFee: s.stripeTaxFee ?? 0,
                refundStatus: s.refundStatus ?? "NONE",
                payoutStatus: s.payoutStatus ?? "ESCROW",
                currency: s.currency || currency,
                eligibleForPayoutAt: s.eligibleForPayoutAt ?? null,
                scheduledPayoutAt: s.scheduledPayoutAt ?? null,
                paidOutAt: s.paidOutAt ?? null,
                transaction: s.transaction ?? { id: "", status: null, totalAmount: null, currency: null },
              };
              if (s.buyer?.id) map.set(`uid:${s.buyer.id}`, row);
              if (buyerEmail) map.set(`em:${buyerEmail.toLowerCase()}`, row);
            }
            setSalesByBuyer(map);
          }
          idx++;
        }
      } catch { /* */ }
    })();
    return () => { cancelled = true; };
  }, [event?.id, communityTag, requiresApproval, isPaid, currency, salesRefreshTick]);

  async function handleAttendeeAction(attendanceId: string, action: "approve" | "reject") {
    setLoadingAction(attendanceId);
    try {
      const res = await fetch(`${API}/api/communities/${communityTag}/events/${event.id}/attendees/${attendanceId}/${action}`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        setPendingAttendees(prev => prev.filter(a => a.id !== attendanceId));
        showToast(action === "approve" ? "Attendee approved" : "Attendee rejected");
      } else {
        showToast("Action failed");
      }
    } catch { showToast("Action failed"); }
    finally { setLoadingAction(null); }
  }

  async function handleResend(invitationId: string) {
    setResending(invitationId);
    try {
      const res = await fetch(`${API}/api/communities/${communityTag}/events/${event.id}/invitations/${invitationId}/resend`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) showToast("Invitation resent");
      else showToast("Failed to resend");
    } catch { showToast("Failed to resend"); }
    finally { setResending(null); }
  }

  /**
   * Resolve the paid-sale row for an attendee — works for both authed
   * users (looked up by `a.user.id`) and guests (looked up by lower-
   * cased email). The salesByBuyer map stores each sale under both
   * "uid:..." and "em:..." prefixes so this is two cheap lookups.
   * Returns undefined for free / comp / invited attendees with no sale.
   */
  function findSaleForAttendee(a: any): SaleRow | undefined {
    const uid: string | undefined = a.user?.id;
    if (uid) {
      const byUid = salesByBuyer.get(`uid:${uid}`);
      if (byUid) return byUid;
    }
    const email: string | undefined = a.email || a.user?.email;
    if (email) {
      const byEmail = salesByBuyer.get(`em:${email.toLowerCase()}`);
      if (byEmail) return byEmail;
    }
    return undefined;
  }

  function exportCSV() {
    // Union form-answer fields across attendees so each becomes a CSV column.
    const fieldMap = new Map<string, string>();
    attendees.forEach((a: any) => {
      const fields = a.formAnswers?.fields;
      if (Array.isArray(fields)) {
        for (const f of fields) if (!fieldMap.has(f.id)) fieldMap.set(f.id, f.label || f.id);
      }
    });
    const fieldEntries = [...fieldMap.entries()];
    const headers = [
      "Name", "Email", "Usertag", "Tier", "Status", "Ticket Price", "Currency", "Purchase Date",
      ...fieldEntries.map(([, label]) => label),
    ];
    const rows = attendees.map((a: any) => {
      const sale = findSaleForAttendee(a);
      const ans = a.formAnswers?.answer || {};
      const cell = (id: string) => {
        const v = ans[id];
        if (v == null || v === "") return "";
        return Array.isArray(v) ? v.join(", ") : String(v);
      };
      return [
        a.name || a.user?.name || "",
        a.email || "",
        a.usertag || a.user?.usertag ? `@${a.usertag || a.user.usertag}` : "",
        a.tier?.name || "",
        "Confirmed",
        sale ? (sale.grossAmount / 100).toFixed(2) : isPaid ? "—" : "Free",
        sale ? sale.currency : currency,
        sale ? new Date(sale.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
        ...fieldEntries.map(([id]) => cell(id)),
      ];
    });
    const csv = [headers, ...rows].map((r: string[]) => r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event?.slug || event?.id}-attendees.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Render the skeleton while EITHER:
  //  • wave-2a (invitations + stats) is still in flight, OR
  //  • the parent's event GET hasn't resolved yet
  //
  // With the parallelization above wave-2a can finish before `event`
  // arrives. Without the `!event` guard we'd briefly render an empty
  // "No attendees yet" state (since attendees come from `event.attendees`)
  // before the real list pops in, which reads as a content flash.
  if (!event || (loading && !stats)) return <AttendeesSectionSkeleton />;

  const totalInvited = stats?.totalInvited ?? 0;
  const accepted = stats?.accepted ?? 0;
  const pending = stats?.pending ?? 0;
  const expired = stats?.expired ?? 0;
  const byInviter = stats?.byInviter ?? [];
  const pendingInvitations = invitations.filter(i => i.status === "PENDING");
  const attendeeCount = approved.length;
  const acceptanceRate = totalInvited > 0 ? Math.round((accepted / totalInvited) * 100) : 0;

  // Sales-aggregate KPIs (only meaningful on paid events). Computed
  // from salesByBuyer — which already filters refundStatus = NONE.
  //
  // The map stores every sale under TWO keys (uid:* and em:*), so a
  // single sale appears twice in Array.from(salesByBuyer.values()).
  // Dedup by sale id before aggregating.
  const salesRows = Array.from(
    new Map(Array.from(salesByBuyer.values()).map((s) => [s.id, s])).values(),
  );
  const totalRevenue = salesRows.reduce((sum, s) => sum + s.grossAmount, 0);
  const totalFees = salesRows.reduce((sum, s) => sum + s.platformFee + (s.stripeFees ?? 0) + (s.stripeTaxFee ?? 0), 0);
  const totalNet = salesRows.reduce((sum, s) => sum + s.ownerNetPayout, 0);
  const paidCount = salesRows.length;
  const fmtMoney = (cents: number) => {
    try {
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: (currency || "EUR").toUpperCase() }).format(cents / 100);
    } catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
  };

  // Sales-ui config — only needed for the refund modal. Mounted at
  // the section root so RefundSaleModal can call the host-refund
  // endpoint with the admin app's auth headers.
  const salesUiConfig = {
    apiBaseUrl: `${API}/api`,
    getAuthHeaders: () => authHeaders(),
    locale: "en-GB",
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "approved", label: "Registered", count: approved.length },
    ...(requiresApproval ? [
      { key: "pending" as Tab, label: "Pending", count: pendingAttendees.length },
    ] : []),
    ...(requiresApproval ? [
      { key: "rejected" as Tab, label: "Rejected", count: rejected.length },
    ] : []),
    // Cancelled: spans self-cancellations + admin removals + (historical)
    // 48h payment timeouts produced by the now-deprecated Pay-now cron.
    // Always shown when there's at least one row so hosts can see the
    // historical exits regardless of event type.
    ...(cancelled.length > 0 ? [
      { key: "cancelled" as Tab, label: "Cancelled", count: cancelled.length },
    ] : []),
    { key: "invitations" as Tab, label: "Invitations", count: pendingInvitations.length },
  ];

  return (
    <SalesUiConfigProvider config={salesUiConfig}>
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 bg-zinc-900 text-white text-[13px] font-medium rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Paid-event sales KPI cards were extracted into <EventRevenueKPIs>
          (feat/manage-event-restructure / attendees-unified sub-PR).
          The KPIs now live on the Overview tab; this section's body
          starts straight at the Attendees header below.
          The salesRows aggregates above are still computed and used by
          the per-row Refund button + the sale lookup for ApprovedRow. */}

      {/* Optional slot for the host app to render between revenue KPIs
          and the Attendees header (cobuntu-admin uses this for the
          inline EventListingsSection — see admin OverviewView).
          Wrapped with mb-6 so the slot's content (a full section
          card in the admin case) gets vertical separation from the
          Attendees header below. The wrapper is conditional on the
          slot being provided so consumers that don't pass anything
          (e.g. cobuntu-community-app's manage UI) don't get a
          phantom 24px gap. */}
      {belowRevenueSlot && <div className="mb-6">{belowRevenueSlot}</div>}

      {/* Header — title + subtitle on the left, primary actions on the
          right. Matches the HostsView / EventListingsSection layout
          (title text-[15px] zinc-900, subtitle text-[12px] zinc-400,
          action buttons px-4 py-2 text-[13px]). */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-zinc-900">Attendees ({attendeeCount})</h2>
            {requiresApproval && pendingAttendees.length > 0 && (
              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                {pendingAttendees.length} pending
              </span>
            )}
          </div>
          <p className="text-[12px] text-zinc-400 mt-0.5">People registered or invited to this event.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {attendeeCount > 0 && (
            <button onClick={exportCSV}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-[13px] font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>
          )}
          {!isPast && (
            <>
              <button onClick={onAddClick || (() => config.navigate(`/${communityTag}/events/${eventId}?view=add-attendees`))} disabled={!isPublished}
                className="flex-1 sm:flex-none px-4 py-2 text-[13px] font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-30 cursor-pointer">
                Add
              </button>
              <button onClick={onInviteClick || (() => config.navigate(`/${communityTag}/events/${eventId}?view=invite-guests`))} disabled={!isPublished}
                className="flex-1 sm:flex-none px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer">
                Invite
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">

      {/* Stats hero */}
      {totalInvited > 0 && (
        <div className="px-4 sm:px-6 py-5 border-b border-zinc-100 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left — Invitations Sent + breakdown + acceptance rate */}
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 sm:p-5">
            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Invitations Sent</p>
            <p className="text-4xl sm:text-5xl font-semibold text-zinc-900 tabular-nums leading-none mb-4">{totalInvited}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500 mb-4">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{accepted} Accepted</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />{pending} Pending</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />{expired} Expired</span>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-zinc-500">Acceptance rate</span>
                <span className="text-[11px] font-semibold text-zinc-700 tabular-nums">{acceptanceRate}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${acceptanceRate}%` }} />
              </div>
            </div>
          </div>

          {/* Right — By Host */}
          <div className="rounded-xl border border-zinc-100 bg-white p-1">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">By Host</span>
              <span className="text-[11px] text-zinc-400 tabular-nums">Accepted / Sent</span>
            </div>
            {byInviter.length > 0 ? (
              <div className="divide-y divide-zinc-50 max-h-[180px] overflow-y-auto">
                {byInviter.map(inv => (
                  <div key={inv.userId} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar user={{ name: inv.name, profileImage: inv.profileImage || undefined, id: inv.userId }} className="w-7 h-7" />
                      <span className="text-[13px] font-medium text-zinc-800 truncate">{inv.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[13px] tabular-nums shrink-0">
                      <span className="font-semibold text-zinc-900">{inv.accepted}</span>
                      <span className="text-zinc-400">/ {inv.totalSent}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-[12px] text-zinc-400">No host breakdown yet</div>
            )}
          </div>
        </div>
      )}

      {/* Tabs — horizontally scrollable on mobile (6+ tabs overflow
          a phone viewport). The container scrolls; the inner pill
          row stays a single row so the active-tab background pill
          renders correctly. */}
      <div className="px-4 sm:px-6 pt-4 pb-3 overflow-x-auto scrollbar-none -mx-0.5 sm:mx-0">
        <div className="inline-flex gap-1 bg-zinc-100 rounded-lg p-0.5 whitespace-nowrap">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md cursor-pointer transition-colors shrink-0 ${
                tab === t.key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              }`}>
              {t.label} {t.count > 0 && <span className="text-zinc-400 ml-0.5">({t.count})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="border-t border-zinc-100">
        {tab === "approved" && (
          approved.length > 0 ? (
            <div className="divide-y divide-zinc-100 max-h-[400px] overflow-y-auto">
              {approved.map((a: any) => (
                <ApprovedRow
                  key={a.id}
                  a={a}
                  sale={findSaleForAttendee(a)}
                  isPaid={isPaid}
                  onOpen={() => setDrawerAttendee(a)}
                  onRefund={(sale) => setRefundSale(sale)}
                />
              ))}
            </div>
          ) : (
            <EmptyState isPublished={isPublished} isPast={isPast} />
          )
        )}

        {tab === "pending" && (
          pendingAttendees.length > 0 ? (
            <div className="divide-y divide-zinc-100 max-h-[400px] overflow-y-auto">
              {pendingAttendees.map((a: any) => (
                <PendingRow key={a.id} a={a}
                  sale={findSaleForAttendee(a)}
                  loading={loadingAction === a.id}
                  isPast={isPast}
                  onApprove={() => handleAttendeeAction(a.id, "approve")}
                  onReject={() => handleAttendeeAction(a.id, "reject")}
                  onOpen={() => setDrawerAttendee(a)} />
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-[13px] text-zinc-400">No pending requests</div>
          )
        )}

        {tab === "rejected" && (
          rejected.length > 0 ? (
            <div className="divide-y divide-zinc-100 max-h-[400px] overflow-y-auto">
              {rejected.map((a: any) => (
                <RejectedRow key={a.id} a={a}
                  sale={findSaleForAttendee(a)}
                  onOpen={() => setDrawerAttendee(a)} />
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-[13px] text-zinc-400">No rejected attendees</div>
          )
        )}

        {tab === "cancelled" && (
          cancelled.length > 0 ? (
            <div className="divide-y divide-zinc-100 max-h-[400px] overflow-y-auto">
              {cancelled.map((a: any) => (
                <CancelledRow key={a.id} a={a}
                  sale={findSaleForAttendee(a)}
                  onOpen={() => setDrawerAttendee(a)} />
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-[13px] text-zinc-400">No cancelled attendees</div>
          )
        )}

        {tab === "invitations" && (
          pendingInvitations.length > 0 ? (
            <div className="divide-y divide-zinc-100 max-h-[400px] overflow-y-auto">
              {pendingInvitations.map(inv => (
                <InvitationRow key={inv.id} inv={inv}
                  resending={resending === inv.id}
                  isPast={isPast}
                  onResend={() => handleResend(inv.id)} />
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-[13px] text-zinc-400">No pending invitations</div>
          )
        )}
      </div>

      </div>
      <AttendeeDetailDrawer
        attendee={drawerAttendee}
        onClose={() => setDrawerAttendee(null)}
        canPromoteToHost={
          drawerAttendee && canPromoteAttendeeToHost
            ? canPromoteAttendeeToHost(drawerAttendee)
            : false
        }
        onPromoteToHost={onPromoteAttendeeFromDrawer}
      />

      {/* Phase H of host-refunds-and-sales-visibility (2026-05-25):
          per-attendee refund modal. Lives at the section root so
          ApprovedRow can trigger it via setRefundSale. On success
          we bump salesRefreshTick to refetch the sales map. */}
      <RefundSaleModal
        sale={refundSale}
        communityTag={communityTag}
        open={refundSale !== null}
        onClose={() => setRefundSale(null)}
        onRefunded={() => {
          setRefundSale(null);
          setSalesRefreshTick((t) => t + 1);
          showToast("Refund issued");
        }}
      />

    </div>
    </SalesUiConfigProvider>
  );

  // ─── Deprecated 2026-06-14 (Reserve-Before-Decide cutover) ──────────
  // PaymentExpiryBadge / LastReminderStamp / PaymentPendingRow /
  // ResendConfirmDialog used to render the 48h Pay-now-link surfaces.
  // Under the new escrow flow there is no Pay-now window: the buyer's
  // card is charged at reservation time and the host's decision either
  // releases the funds or auto-refunds the buyer net of Stripe's fee.
  // All four components + their handlers were deleted in this PR.

  function ApprovedRow({ a, sale, isPaid, onOpen, onRefund }: {
    a: any;
    sale?: SaleRow;
    isPaid: boolean;
    onOpen: () => void;
    onRefund: (sale: SaleRow) => void;
  }) {
    const subtitle: string[] = [];
    if (a.user?.usertag || a.usertag) subtitle.push(`@${a.user?.usertag || a.usertag}`);
    if (a.email) subtitle.push(a.email);
    const refundable = sale && sale.payoutStatus === "ESCROW";
    return (
      <div role="button" tabIndex={0} onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        className="group flex items-start sm:items-center gap-3 px-4 sm:px-6 py-3 cursor-pointer hover:bg-zinc-50 transition-colors outline-none focus-visible:bg-zinc-50">
        <UserAvatar user={a.user || { name: a.name }} className="w-9 h-9 shrink-0" />
        {/* Center column. On desktop the trailing badges + actions sit
            inline (sm:flex-row); on mobile they wrap to a second line
            (flex-col) so the name/subtitle don't fight for width with
            them. */}
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-zinc-800 truncate">{a.name || a.user?.name || "Unknown"}</p>
              {a.type === "guest" && <span className="text-[9px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">Guest</span>}
            </div>
            {subtitle.length > 0 && <p className="text-[11px] text-zinc-400 truncate">{subtitle.join(" · ")}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {a.tier?.name && (
              <span className="text-[10px] font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded shrink-0">{a.tier.name}</span>
            )}
            {sale && (
              <span className="text-[12px] font-medium text-zinc-900 tabular-nums">
                {SYMBOLS[sale.currency] || sale.currency} {(sale.grossAmount / 100).toFixed(2)}
              </span>
            )}
            {!sale && !isPaid && (
              <span className="text-[11px] text-zinc-400">Free</span>
            )}
            {!sale && isPaid && (
              <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded shrink-0">Complimentary</span>
            )}
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0">Confirmed</span>
            {/* Phase H: Refund button only for paid attendees within escrow.
                2026-06-15 (feat/publish-validation-errors-and-refund-ux):
                surfaced the disabled-state reason inline instead of
                hiding it in a hover-only `title=` tooltip. Pre-fix the
                grayed-out button gave hosts no idea why they couldn't
                refund — they'd assume something was broken. Now the
                label itself becomes "Refund window closed" with a
                visible (i) icon and a richer tooltip explaining where
                to go for help. */}
            {sale && refundable && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRefund(sale); }}
                title="Refund this attendee"
                className="px-2 py-0.5 text-[10px] font-medium rounded border shrink-0 border-zinc-200 text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                Refund
              </button>
            )}
            {sale && !refundable && (
              <span
                title="The escrow window ended when the sale moved to payout. Contact Cobuntu support to escalate a refund."
                className="px-2 py-0.5 text-[10px] font-medium rounded border shrink-0 border-zinc-200 text-zinc-500 bg-zinc-50 inline-flex items-center gap-1 cursor-help"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Refund window closed
              </span>
            )}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="text-zinc-300 group-hover:text-zinc-500 transition-colors shrink-0 mt-1 sm:mt-0" aria-hidden>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    );
  }

  // The `isPast` flag mirrors the section-level flag. Approving a
  // PENDING attendance after the event has ended produces a junk-data
  // path (the would-be attendee can never actually attend), so we lock
  // Approve on past events. Reject stays open — it's the legitimate
  // cleanup path for the pending queue post-event.
  function PendingRow({ a, sale, loading, onApprove, onReject, onOpen, isPast }: { a: any; sale?: SaleRow; loading: boolean; onApprove: () => void; onReject: () => void; onOpen: () => void; isPast: boolean }) {
    const subtitle: string[] = [];
    if (a.user?.usertag || a.usertag) subtitle.push(`@${a.user?.usertag || a.usertag}`);
    if (a.email) subtitle.push(a.email);
    // Held-money badge for paid+approval applicants. Under the
    // Reserve-Before-Decide flow the buyer pre-paid at reservation
    // time; the funds sit in Cobuntu's platform escrow with
    // sale.payoutStatus='ESCROW' until the host approves (release) or
    // rejects (auto-refund net of Stripe's processing fee per T&Cs
    // §7.6). Surfacing the held amount here tells the host exactly
    // how much money is on the line for this decision.
    const heldInEscrow = sale && sale.payoutStatus === "ESCROW" && sale.refundStatus === "NONE";
    return (
      <div role="button" tabIndex={0} onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        className="group flex items-start sm:items-center gap-3 px-4 sm:px-6 py-3 cursor-pointer hover:bg-zinc-50 transition-colors outline-none focus-visible:bg-zinc-50">
        <UserAvatar user={a.user || { name: a.name }} className="w-9 h-9 shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-zinc-800 truncate">{a.name || a.user?.name || "Unknown"}</p>
              {a.type === "guest" && <span className="text-[9px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">Guest</span>}
            </div>
            {subtitle.length > 0 && <p className="text-[11px] text-zinc-400 truncate">{subtitle.join(" · ")}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {a.tier?.name && (
              <span className="text-[10px] font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded shrink-0">{a.tier.name}</span>
            )}
            {heldInEscrow && (
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 shrink-0 tabular-nums"
                title="Held by Cobuntu in escrow. Approving releases the funds toward the next bi-weekly payout. Rejecting auto-refunds the buyer (net of Stripe's processing fee, which the buyer absorbs)."
              >
                {SYMBOLS[sale!.currency] || sale!.currency} {(sale!.grossAmount / 100).toFixed(2)} held
              </span>
            )}
            <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button onClick={onApprove} disabled={loading || isPast}
                title={isPast ? "Event has ended — approve disabled" : undefined}
                className="px-3 py-1 text-[11px] font-medium bg-emerald-500 text-white rounded-md hover:bg-emerald-600 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Approve
              </button>
              <button onClick={onReject} disabled={loading}
                className="px-3 py-1 text-[11px] font-medium bg-zinc-100 text-zinc-600 rounded-md hover:bg-zinc-200 cursor-pointer transition-colors disabled:opacity-50">
                Reject
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /**
   * Compact green badge surfacing the refund state of a sale tied to a
   * non-active attendance (CANCELLED or REJECTED row). Renders nothing
   * when there's no sale or the sale wasn't refunded.
   *
   * The badge intentionally doesn't show an amount because the precise
   * amount differs by which refund pathway fired:
   *   - Post-conversion refund (Flow 29 today): buyer gets gross back,
   *     host eats the Stripe fee via seller_payout_debits.
   *   - Pre-conversion refund (new Flow 11.5 self-cancel + Flow 14
   *     host reject): buyer gets gross-minus-Stripe-fee, host is not
   *     charged (T&Cs §7.6).
   * Both look identical from a SaleRow snapshot. Hosts who want the
   * exact figure can click into the attendee drawer or the sales view;
   * the badge is the at-a-glance "money was returned" signal.
   */
  function RefundBadge({ sale }: { sale?: SaleRow }) {
    if (!sale) return null;
    if (sale.refundStatus === "FULL") {
      return (
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0"
          title="Money has been returned to the buyer. Open the attendee or the sales view to see the exact refund amount."
        >
          Refunded
        </span>
      );
    }
    if (sale.refundStatus === "PARTIAL") {
      return (
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50/60 text-emerald-700/80 border border-emerald-100 shrink-0"
          title="Partial refund issued. Open the attendee or the sales view to see the exact remaining balance."
        >
          Partial refund
        </span>
      );
    }
    return null;
  }

  function RejectedRow({ a, sale, onOpen }: { a: any; sale?: SaleRow; onOpen: () => void }) {
    const subtitle: string[] = [];
    if (a.user?.usertag || a.usertag) subtitle.push(`@${a.user?.usertag || a.usertag}`);
    if (a.email) subtitle.push(a.email);
    return (
      <div role="button" tabIndex={0} onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        className="group flex items-start sm:items-center gap-3 px-4 sm:px-6 py-3 cursor-pointer hover:bg-zinc-50 transition-colors outline-none focus-visible:bg-zinc-50 opacity-60">
        <UserAvatar user={a.user || { name: a.name }} className="w-9 h-9 shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-800 truncate">{a.name || a.user?.name || "Unknown"}</p>
            {subtitle.length > 0 && <p className="text-[11px] text-zinc-400 truncate">{subtitle.join(" · ")}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            <RefundBadge sale={sale} />
            <span className="text-[10px] font-medium text-red-400 bg-red-50 px-2 py-0.5 rounded shrink-0">Rejected</span>
          </div>
        </div>
      </div>
    );
  }

  function CancelledRow({ a, sale, onOpen }: { a: any; sale?: SaleRow; onOpen: () => void }) {
    const subtitle: string[] = [];
    if (a.user?.usertag || a.usertag) subtitle.push(`@${a.user?.usertag || a.usertag}`);
    if (a.email) subtitle.push(a.email);
    // Reason chip — distinguishes self-cancel / admin removal / (historical)
    // 48h payment timeout so hosts can scan exits at a glance without
    // opening the drawer. PAYMENT_TIMEOUT will be backfilled to NULL in
    // the matching backend cleanup PR; the label is left here so the 9
    // historical rows still display readable text until then.
    const reasonLabels: Record<string, string> = {
      USER_REQUEST: "Self-cancelled",
      ADMIN_REMOVAL: "Removed by host",
      PAYMENT_TIMEOUT: "Payment timed out",
    };
    const reason = a.cancellationReason ? reasonLabels[a.cancellationReason] : null;
    return (
      <div role="button" tabIndex={0} onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        className="group flex items-start sm:items-center gap-3 px-4 sm:px-6 py-3 cursor-pointer hover:bg-zinc-50 transition-colors outline-none focus-visible:bg-zinc-50 opacity-60">
        <UserAvatar user={a.user || { name: a.name }} className="w-9 h-9 shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-800 truncate">{a.name || a.user?.name || "Unknown"}</p>
            {subtitle.length > 0 && <p className="text-[11px] text-zinc-400 truncate">{subtitle.join(" · ")}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {reason && (
              <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded shrink-0">{reason}</span>
            )}
            <RefundBadge sale={sale} />
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200 shrink-0">Cancelled</span>
          </div>
        </div>
      </div>
    );
  }

  // `isPast`: gates Resend. Re-sending an invitation to a past event
  // delivers a link to an ended event — junk path. The row itself
  // stays visible (hosts may still want to see the invitation history).
  function InvitationRow({ inv, resending, isPast, onResend }: { inv: Invitation; resending: boolean; isPast: boolean; onResend: () => void }) {
    return (
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
        {inv.invitedUser?.profileImage ? (
          <img src={inv.invitedUser.profileImage} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-800 truncate">{inv.invitedUser?.name || inv.email}</p>
          <p className="text-[11px] text-zinc-400 truncate">{inv.invitedUser ? `@${inv.invitedUser.usertag}` : inv.email}</p>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 shrink-0">Pending</span>
        <button onClick={onResend} disabled={resending || isPast}
          className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          title={isPast ? "Event has ended — resend disabled" : "Resend invitation"}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>
    );
  }

  function EmptyState({ isPublished, isPast }: { isPublished: boolean; isPast: boolean }) {
    return (
      <div className="px-6 py-10 text-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-zinc-200 mb-3">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p className="text-sm text-zinc-500">No attendees yet</p>
        {isPublished && !isPast && (
          <p className="text-xs text-zinc-400 mt-1">Invite people to get them signed up.</p>
        )}
      </div>
    );
  }
}

/**
 * Placeholder layout shown while wave-2 fetches (/invitations/stats,
 * /invitations, /pending-attendees, /sales) are in flight. Mirrors the
 * resolved component: section header with action buttons, the tabs row,
 * and four attendee rows. animate-pulse on every shaded block. Kept
 * structure-only so it slots in without re-layout when the real data
 * lands.
 */
function AttendeesSectionSkeleton() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden" aria-busy="true" aria-label="Loading attendees">
      {/* Header row — "Attendees (n)" + Export / Add / Invite buttons. */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-full bg-zinc-100 animate-pulse" />
          <div className="h-5 w-28 rounded bg-zinc-100 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-20 rounded-md bg-zinc-100 animate-pulse" />
          <div className="h-9 w-28 rounded-md bg-zinc-100 animate-pulse" />
          <div className="h-9 w-16 rounded-md bg-zinc-900/80 animate-pulse" />
        </div>
      </div>
      {/* Tabs row. */}
      <div className="flex items-center gap-2 px-6 pb-3 border-b border-zinc-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-24 rounded-full bg-zinc-100 animate-pulse" />
        ))}
      </div>
      {/* Attendee rows. */}
      <div className="divide-y divide-zinc-100">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-6 py-3">
            <div className="w-9 h-9 rounded-full bg-zinc-100 animate-pulse" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="h-3.5 w-40 rounded bg-zinc-100 animate-pulse" />
              <div className="h-2.5 w-56 rounded bg-zinc-100/70 animate-pulse" />
            </div>
            <div className="h-5 w-20 rounded-full bg-zinc-100 animate-pulse" />
            <div className="h-5 w-24 rounded-full bg-zinc-100 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
