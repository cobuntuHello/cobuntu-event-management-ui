"use client";

import { useState, useEffect, useMemo } from "react";
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

type Tab = "approved" | "pending" | "rejected" | "invitations";

const SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", BRL: "R$" };

export function AttendeesAndInvitationsSection({ event, communityTag, isPublished, isPast, refreshKey = 0, onInviteClick }: Props) {
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

  useEffect(() => {
    if (!event?.id || !communityTag) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const fetches: Promise<Response>[] = [
          fetch(`${API}/api/communities/${communityTag}/events/${event.id}/invitations/stats`, { headers: authHeaders() }),
          fetch(`${API}/api/communities/${communityTag}/events/${event.id}/invitations`, { headers: authHeaders() }),
        ];
        if (requiresApproval) {
          fetches.push(fetch(`${API}/api/communities/${communityTag}/events/${event.id}/pending-attendees`, { headers: authHeaders() }));
        }
        if (isPaid) {
          fetches.push(fetch(`${API}/api/communities/${communityTag}/sales?timeRange=1y`, { headers: authHeaders() }));
        }
        const responses = await Promise.all(fetches);
        if (cancelled) return;

        let idx = 0;
        if (responses[idx].ok) setStats(await responses[idx].json());
        idx++;
        if (responses[idx].ok) {
          const data = await responses[idx].json();
          setInvitations(data.invitations || []);
        }
        idx++;
        if (requiresApproval) {
          if (responses[idx]?.ok) setPendingAttendees(await responses[idx].json());
          idx++;
        }
        if (isPaid && responses[idx]?.ok) {
          const salesData = await responses[idx].json();
          const map = new Map<string, SaleRow>();
          for (const s of (salesData.sales || [])) {
            if (s.eventId === event.id && s.refundStatus === "NONE" && s.buyer?.id) {
              // Carry the full SaleRow shape — KPI cards need fees +
              // ownerNetPayout; RefundSaleModal needs the whole thing.
              map.set(s.buyer.id, {
                id: s.id,
                createdAt: s.createdAt,
                eventId: s.eventId ?? null,
                productSnapshot: null,
                buyer: {
                  id: s.buyer.id,
                  name: s.buyer.name ?? null,
                  usertag: s.buyer.usertag ?? null,
                },
                buyerEmail: s.buyer.email ?? s.buyerEmail ?? null,
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
              });
            }
          }
          setSalesByBuyer(map);
        }
      } catch { /* */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [event?.id, communityTag, refreshKey, requiresApproval, isPaid, currency, salesRefreshTick]);

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
      const sale = salesByBuyer.get(a.user?.id);
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

  if (loading && !stats) return null;

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
  const salesRows = Array.from(salesByBuyer.values());
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
      { key: "rejected" as Tab, label: "Rejected", count: rejected.length },
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

      {/* Paid-event sales KPI cards. Phase H of host-refunds-and-
          sales-visibility (2026-05-25): consolidates the prior
          standalone TicketSalesSection into the Attendees section so
          there's one canonical surface — paid attendees are the
          sales, no need for two sections rendering overlapping data.
          Only shows for paid events with at least one sale. */}
      {isPaid && paidCount > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <p className="text-xs text-zinc-500">Paid attendees</p>
            <p className="text-2xl font-semibold text-zinc-900 mt-1 tabular-nums">{paidCount}</p>
            <p className="text-xs text-zinc-400 mt-1">{attendeeCount - paidCount} comp/invited</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <p className="text-xs text-zinc-500">Revenue</p>
            <p className="text-2xl font-semibold text-zinc-900 mt-1 tabular-nums">{fmtMoney(totalRevenue)}</p>
            <p className="text-xs text-zinc-400 mt-1">{paidCount} transactions, gross</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <p className="text-xs text-zinc-500">Fees paid</p>
            <p className="text-2xl font-semibold text-zinc-900 mt-1 tabular-nums">{fmtMoney(totalFees)}</p>
            <p className="text-xs text-zinc-400 mt-1">Platform + Stripe</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <p className="text-xs text-zinc-500">Net earnings</p>
            <p className="text-2xl font-semibold text-emerald-600 mt-1 tabular-nums">{fmtMoney(totalNet)}</p>
            <p className="text-xs text-zinc-400 mt-1">After all fees</p>
          </div>
        </div>
      )}

      {/* Header — title + actions inline, no outer card frame (mirrors
          the TicketSalesSection pattern). The card wrapping the stats
          hero + tabs + list lives below. */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <h3 className="text-sm font-semibold text-zinc-900">Attendees ({attendeeCount})</h3>
          {requiresApproval && pendingAttendees.length > 0 && (
            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
              {pendingAttendees.length} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {attendeeCount > 0 && (
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>
          )}
          {!isPast && (
            <>
              <button onClick={() => config.navigate(`/${communityTag}/events/${eventId}?view=add-attendees`)} disabled={!isPublished}
                className="px-3 py-1.5 text-[12px] font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-30 cursor-pointer">
                Add Attendees
              </button>
              <button onClick={onInviteClick || (() => config.navigate(`/${communityTag}/events/${eventId}?view=invite-guests`))} disabled={!isPublished}
                className="px-3 py-1.5 text-[12px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer">
                Invite
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">

      {/* Stats hero */}
      {totalInvited > 0 && (
        <div className="px-6 py-5 border-b border-zinc-100 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left — Invitations Sent + breakdown + acceptance rate */}
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-5">
            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Invitations Sent</p>
            <p className="text-5xl font-semibold text-zinc-900 tabular-nums leading-none mb-4">{totalInvited}</p>
            <div className="flex items-center gap-4 text-[12px] text-zinc-500 mb-4">
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

      {/* Tabs */}
      <div className="px-6 pt-4 pb-3">
        <div className="inline-flex gap-1 bg-zinc-100 rounded-lg p-0.5">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md cursor-pointer transition-colors ${
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
                  sale={salesByBuyer.get(a.user?.id)}
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
                  loading={loadingAction === a.id}
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
                <RejectedRow key={a.id} a={a} onOpen={() => setDrawerAttendee(a)} />
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-[13px] text-zinc-400">No rejected attendees</div>
          )
        )}

        {tab === "invitations" && (
          pendingInvitations.length > 0 ? (
            <div className="divide-y divide-zinc-100 max-h-[400px] overflow-y-auto">
              {pendingInvitations.map(inv => (
                <InvitationRow key={inv.id} inv={inv}
                  resending={resending === inv.id}
                  onResend={() => handleResend(inv.id)} />
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-[13px] text-zinc-400">No pending invitations</div>
          )
        )}
      </div>

      </div>
      <AttendeeDetailDrawer attendee={drawerAttendee} onClose={() => setDrawerAttendee(null)} />

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
        className="group flex items-center gap-3 px-6 py-3 cursor-pointer hover:bg-zinc-50 transition-colors outline-none focus-visible:bg-zinc-50">
        <UserAvatar user={a.user || { name: a.name }} className="w-9 h-9" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-zinc-800 truncate">{a.name || a.user?.name || "Unknown"}</p>
            {a.type === "guest" && <span className="text-[9px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">Guest</span>}
          </div>
          {subtitle.length > 0 && <p className="text-[11px] text-zinc-400 truncate">{subtitle.join(" · ")}</p>}
        </div>
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
          <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded shrink-0">Comp</span>
        )}
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0">Confirmed</span>
        {/* Phase H: Refund button only for paid attendees within escrow. */}
        {sale && (
          <button
            type="button"
            disabled={!refundable}
            onClick={(e) => { e.stopPropagation(); if (refundable) onRefund(sale); }}
            title={refundable ? "Refund this attendee" : "Refund window has passed — contact Cobuntu support to escalate."}
            className={`px-2 py-0.5 text-[10px] font-medium rounded border shrink-0 ${refundable ? "border-zinc-200 text-zinc-700 hover:bg-zinc-50 cursor-pointer" : "border-zinc-100 text-zinc-300 cursor-not-allowed"}`}
          >
            Refund
          </button>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="text-zinc-300 group-hover:text-zinc-500 transition-colors shrink-0" aria-hidden>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    );
  }

  function PendingRow({ a, loading, onApprove, onReject, onOpen }: { a: any; loading: boolean; onApprove: () => void; onReject: () => void; onOpen: () => void }) {
    const subtitle: string[] = [];
    if (a.user?.usertag || a.usertag) subtitle.push(`@${a.user?.usertag || a.usertag}`);
    if (a.email) subtitle.push(a.email);
    return (
      <div role="button" tabIndex={0} onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        className="group flex items-center gap-3 px-6 py-3 cursor-pointer hover:bg-zinc-50 transition-colors outline-none focus-visible:bg-zinc-50">
        <UserAvatar user={a.user || { name: a.name }} className="w-9 h-9" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-zinc-800 truncate">{a.name || a.user?.name || "Unknown"}</p>
            {a.type === "guest" && <span className="text-[9px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">Guest</span>}
          </div>
          {subtitle.length > 0 && <p className="text-[11px] text-zinc-400 truncate">{subtitle.join(" · ")}</p>}
        </div>
        {a.tier?.name && (
          <span className="text-[10px] font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded shrink-0">{a.tier.name}</span>
        )}
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={onApprove} disabled={loading}
            className="px-3 py-1 text-[11px] font-medium bg-emerald-500 text-white rounded-md hover:bg-emerald-600 cursor-pointer transition-colors disabled:opacity-50">
            Approve
          </button>
          <button onClick={onReject} disabled={loading}
            className="px-3 py-1 text-[11px] font-medium bg-zinc-100 text-zinc-600 rounded-md hover:bg-zinc-200 cursor-pointer transition-colors disabled:opacity-50">
            Reject
          </button>
        </div>
      </div>
    );
  }

  function RejectedRow({ a, onOpen }: { a: any; onOpen: () => void }) {
    const subtitle: string[] = [];
    if (a.user?.usertag || a.usertag) subtitle.push(`@${a.user?.usertag || a.usertag}`);
    if (a.email) subtitle.push(a.email);
    return (
      <div role="button" tabIndex={0} onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        className="group flex items-center gap-3 px-6 py-3 cursor-pointer hover:bg-zinc-50 transition-colors outline-none focus-visible:bg-zinc-50 opacity-60">
        <UserAvatar user={a.user || { name: a.name }} className="w-9 h-9" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-800 truncate">{a.name || a.user?.name || "Unknown"}</p>
          {subtitle.length > 0 && <p className="text-[11px] text-zinc-400 truncate">{subtitle.join(" · ")}</p>}
        </div>
        <span className="text-[10px] font-medium text-red-400 bg-red-50 px-2 py-0.5 rounded shrink-0">Rejected</span>
      </div>
    );
  }

  function InvitationRow({ inv, resending, onResend }: { inv: Invitation; resending: boolean; onResend: () => void }) {
    return (
      <div className="flex items-center gap-3 px-6 py-3">
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
        <button onClick={onResend} disabled={resending}
          className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded cursor-pointer disabled:opacity-50 shrink-0"
          title="Resend invitation">
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
