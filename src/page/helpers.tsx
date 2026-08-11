import { useState, useEffect } from "react";
import { getEventManagementConfig } from "../config";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function authHeaders(): Record<string, string> {
  return getEventManagementConfig().authHeaders();
}

export function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeaders() };
}

export async function updateEvent(communityTag: string, eventId: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}/api/communities/${communityTag}/events/${eventId}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update");
  }
  return res.json();
}

export function formatEventDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
}

export function formatEventTime(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function getTimezoneAbbr(tz: string) {
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date());
    return parts.find(p => p.type === "timeZoneName")?.value || "";
  } catch { return ""; }
}

export function getEventStatus(event: any) {
  const now = new Date();
  const startDate = event?.startDate ? new Date(event.startDate) : null;
  const endDate = event?.endDate ? new Date(event.endDate) : null;
  const isPast = endDate ? endDate < now : false;
  const isPublishedInAnyListing = (event?.communities || []).some((c: any) => c.status === "ACTIVE" && !c.isHidden);
  const isLive = isPublishedInAnyListing && startDate && endDate ? startDate <= now && endDate >= now : false;
  const isPaid = event?.price > 0;
  // 2026-06-18: fixed the headline count to count only currently-
  // attending people (APPROVED). The BE host-view _count.attendees
  // includes ALL statuses (APPROVED + PENDING + CANCELLED + REJECTED)
  // because the host view doesn't auto-filter for back-compat. The
  // headline "21 attendees" surfaced 12 APPROVED + 9 CANCELLED on PBN
  // W35 and read as wrong — cancelled buyers aren't attending. PENDING
  // is excluded too: not yet confirmed. The Attendees tab still shows
  // all buckets in its sub-tabs (Pending / Approved / Cancelled).
  const attendeeCount = Array.isArray(event?.attendees)
    ? event.attendees.filter((a: any) => a?.status === "APPROVED").length
    : event?._count?.attendees || 0;
  const isPublished = (() => {
    const listing = event?.communities?.[0];
    return !!(listing && !listing.isHidden && listing.status === "ACTIVE");
  })();

  const missingRequirements: string[] = [];
  if (!event?.name?.trim()) missingRequirements.push("add a title");
  if (!startDate || startDate <= now) missingRequirements.push("set a valid start date");
  if (!endDate || (startDate && endDate <= startDate)) missingRequirements.push("set a valid end date");
  if (!event?.physicalLocation?.trim() && !event?.onlineUrl?.trim()) missingRequirements.push("add a location");

  // 2026-06-15 (feat/publish-tier-requirement): an event with tiers
  // cannot be published if none of them have publishedAt set. The BE
  // EventListingService.updateEventListingVisibility (line ~718)
  // already rejects this with a ValidationError, but pre-fix the
  // admin UI showed "Ready to publish" anyway — buyers saw the
  // listing as published while the BE refused to surface the tier
  // prices. Mirror the BE check here so the UI gates the Publish
  // CTA upfront. RSVP-only events (no tiers at all) are not
  // affected — they're free + always publishable.
  const tiers: any[] = Array.isArray(event?.tiers) ? event.tiers : [];
  const activeTiers = tiers.filter((t: any) => !t.archivedAt);
  if (activeTiers.length > 0 && !activeTiers.some((t: any) => t.publishedAt)) {
    missingRequirements.push("publish at least one ticket tier");
  }

  return { startDate, endDate, isPast, isLive, isPaid, attendeeCount, isPublished, missingRequirements };
}

export const CURRENCIES = [
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$" },
  { code: "AUD", name: "Australian Dollar", symbol: "$" },
];

// Reusable modal wrapper — portaled to body to escape overflow containers
import { createPortal } from "react-dom";

export function ModalShell({ children, onClose, width = "w-[420px]" }: { children: React.ReactNode; onClose: () => void; width?: string }) {
  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[120]" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-xl ${width} p-6 text-zinc-900`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}

// Pencil icon for hover states
export function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
  );
}

// ─── Stripe status hook ──────────────────────────

const stripeCache = new Map<string, { connected: boolean; chargesEnabled: boolean }>();

export function useStripeStatus(communityTag: string) {
  const [status, setStatus] = useState<{ connected: boolean; chargesEnabled: boolean; loading: boolean }>({
    connected: false, chargesEnabled: false, loading: true,
  });

  useEffect(() => {
    if (!communityTag) { setStatus({ connected: false, chargesEnabled: false, loading: false }); return; }
    const cached = stripeCache.get(communityTag);
    if (cached) { setStatus({ ...cached, loading: false }); return; }

    (async () => {
      try {
        // /stripe/connected (NOT /stripe/status) — gated on ACCESS_ADMIN_APP
        // so non-financial admins can read the boolean to gate paid-tier
        // edit flows. Hook is consumed by EditEventDrawer + PriceEditModal.
        const res = await fetch(`${API}/api/communities/${communityTag}/stripe/connected`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          const result = { connected: !!data.connected, chargesEnabled: !!data.chargesEnabled };
          stripeCache.set(communityTag, result);
          setStatus({ ...result, loading: false });
        } else {
          setStatus({ connected: false, chargesEnabled: false, loading: false });
        }
      } catch {
        setStatus({ connected: false, chargesEnabled: false, loading: false });
      }
    })();
  }, [communityTag]);

  return status;
}

// ─── Stripe warning component ────────────────────

export function StripeRequiredWarning({ communityTag, onClose }: { communityTag: string; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[120] text-zinc-900" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[calc(100vw-2rem)] md:w-[420px] p-6" onClick={e => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        </div>
        <h3 className="text-[15px] font-semibold text-zinc-900 mb-2">Connect Stripe</h3>
        <p className="text-[13px] text-zinc-500 mb-1">
          This community doesn&apos;t have a payment account configured yet.
        </p>
        <p className="text-[13px] text-zinc-500 mb-5">
          We use Stripe to process payments. Connect or set up a Stripe account to start accepting payments. It usually takes less than 5 minutes.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
          <a href={`/${communityTag}/connect-stripe`} className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 no-underline cursor-pointer">
            Connect Stripe
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
