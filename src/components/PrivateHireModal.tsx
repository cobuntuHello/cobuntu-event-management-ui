"use client";

import { useEffect, useRef, useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useEventManagementConfig, useJsonHeaders } from "../config";
import { useEventT } from "../create-wizard/i18n";
import { searchPeople, type PersonSearchResult } from "@cobuntu/management-ui-shared";

/**
 * T-286 ("Packages v2: hold vs sinal") — the admin side of a private room
 * hire's money flow. See docs/features/packages-v2-private-hire.md in
 * cobuntu-backend-monorepo for the full design.
 *
 * This is a quick-action modal off the Overview tab, not a wizard step —
 * starting a booking and charging the remainder are both ACTIONS with real
 * Stripe side effects (a charge attempt fires the moment you click), not
 * form fields to fill in while setting up the event. Same category as
 * Publish/Delete/Duplicate, which already live here.
 *
 * Talks to:
 *   GET  /api/communities/:tag/events/:id/private-hire
 *   POST /api/communities/:tag/events/:id/private-hire/deposit-checkout
 *   POST /api/communities/:tag/events/:id/private-hire/charge-final-invoice
 */

type BookingStatus =
  | "NONE"
  | "DEPOSIT_PENDING"
  | "DEPOSIT_PAID"
  | "FINAL_INVOICE_OPEN"
  | "FINAL_INVOICE_PAID"
  | "FINAL_INVOICE_FAILED";

interface BookingState {
  exists: boolean;
  status: BookingStatus;
  bookedByUser?: { id: string; name: string | null; usertag: string | null };
  currency?: string;
  totalAmountCents?: number;
  depositPercent?: number;
  depositAmountCents?: number;
  depositPaidAt?: string | null;
  extraAmountCents?: number;
  finalInvoiceAmountCents?: number | null;
  finalInvoicePaidAt?: string | null;
  finalInvoiceFailureReason?: string | null;
}

interface Props {
  event: { id: string; name: string };
  communityTag: string;
  onClose: () => void;
}

function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function PrivateHireModal({ event, communityTag, onClose }: Props) {
  const { apiBaseUrl, authHeaders } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const t = useEventT("eventsUi.manageUi.privateHireModal");
  const tc = useEventT("eventsUi.manageUi.overviewCommon");

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<BookingState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Start-booking form state
  const [renter, setRenter] = useState<PersonSearchResult | null>(null);
  const [renterEmail, setRenterEmail] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [totalAmount, setTotalAmount] = useState("");
  const [depositPercent, setDepositPercent] = useState("25");
  const [submitting, setSubmitting] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Final-invoice form state
  const [extraAmount, setExtraAmount] = useState("");
  const [charging, setCharging] = useState(false);

  const searchAbort = useRef<AbortController | null>(null);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/private-hire`,
        { headers: authHeaders() },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || t("errLoadFailed"));
      setBooking(await res.json());
    } catch (err: any) {
      setError(err?.message || t("errLoadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    searchAbort.current?.abort();
    if (query.trim().length < 1) { setResults([]); return; }
    const controller = new AbortController();
    searchAbort.current = controller;
    const timer = setTimeout(async () => {
      const people = await searchPeople({
        apiBaseUrl, communityTag, query, headers: authHeaders(), signal: controller.signal,
      });
      setResults(people);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startBooking() {
    if (!renter) { setError(t("errPickRenter")); return; }
    if (!renterEmail.trim() || !renterEmail.includes("@")) { setError(t("errInvalidEmail")); return; }
    const totalAmountCents = Math.round(parseFloat(totalAmount || "0") * 100);
    if (!Number.isFinite(totalAmountCents) || totalAmountCents <= 0) {
      setError(t("errInvalidTotal"));
      return;
    }
    const pct = parseInt(depositPercent, 10);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
      setError(t("errInvalidPercent"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/private-hire/deposit-checkout`,
        {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({
            bookedByUserId: renter.id,
            bookedByEmail: renterEmail.trim(),
            totalAmountCents,
            depositPercent: pct,
            successUrl: typeof window !== "undefined" ? window.location.href : "",
            cancelUrl: typeof window !== "undefined" ? window.location.href : "",
          }),
        },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || t("errStartFailed"));
      const data = await res.json();
      setCheckoutUrl(data.checkoutUrl);
    } catch (err: any) {
      setError(err?.message || t("errStartFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function chargeFinalInvoice() {
    const extraAmountCents = extraAmount.trim() ? Math.round(parseFloat(extraAmount) * 100) : undefined;
    if (extraAmountCents !== undefined && (!Number.isFinite(extraAmountCents) || extraAmountCents < 0)) {
      setError(t("errInvalidExtra"));
      return;
    }
    setCharging(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/private-hire/charge-final-invoice`,
        { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ extraAmountCents }) },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || t("errChargeFailed"));
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || t("errChargeFailed"));
    } finally {
      setCharging(false);
    }
  }

  async function copyLink() {
    if (!checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard can throw in insecure contexts; silently ignore */ }
  }

  if (loading) {
    return (
      <ModalShell onClose={onClose}>
        <p className="text-[13px] text-zinc-500">{tc("loading")}</p>
      </ModalShell>
    );
  }

  // ── Checkout link just created ──────────────────────────────────────
  if (checkoutUrl) {
    return (
      <ModalShell onClose={onClose}>
        <h3 className="text-[15px] font-semibold text-zinc-900 mb-3">{t("linkReadyTitle")}</h3>
        <div className="rounded-lg bg-emerald-50 p-3 mb-3">
          <p className="text-sm font-medium text-emerald-700">{t("linkReadyBody")}</p>
        </div>
        <button
          onClick={copyLink}
          className="w-full flex items-center gap-2 p-3 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition-colors cursor-pointer text-left mb-4"
        >
          <p className="text-xs text-zinc-500 truncate flex-1">{checkoutUrl}</p>
          <span className="text-[12px] font-medium text-zinc-600 shrink-0">{copied ? tc("copied") : tc("copy")}</span>
        </button>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer">
            {tc("close")}
          </button>
        </div>
      </ModalShell>
    );
  }

  // ── No booking yet: start one ───────────────────────────────────────
  if (!booking?.exists) {
    const depositPreview = (() => {
      const total = parseFloat(totalAmount || "0");
      const pct = parseFloat(depositPercent || "0");
      if (!Number.isFinite(total) || !Number.isFinite(pct) || total <= 0) return null;
      // deposit cents = (total euros * pct / 100) * 100 cents/euro, which
      // collapses to total * pct — formatCents divides back by 100 to render.
      return formatCents(Math.round(total * pct));
    })();

    return (
      <ModalShell onClose={onClose}>
        <h3 className="text-[15px] font-semibold text-zinc-900 mb-3">{t("startTitle")}</h3>

        <label className="block text-[12px] font-medium text-zinc-700 mb-1">{t("renterLabel")}</label>
        {renter ? (
          <div className="flex items-center justify-between rounded-lg bg-zinc-50 p-2 mb-3">
            <span className="text-[13px] text-zinc-900">{renter.name || renter.usertag || renter.id}</span>
            <button onClick={() => { setRenter(null); setQuery(""); setRenterEmail(""); }} className="text-[12px] text-zinc-500 hover:text-zinc-700 cursor-pointer">
              {t("change")}
            </button>
          </div>
        ) : (
          <div className="relative mb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("renterPlaceholder")}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                {results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setRenter(p); setResults([]); }}
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-zinc-50 cursor-pointer"
                  >
                    {p.name || p.usertag || p.id}
                    {p.usertag && p.name ? <span className="text-zinc-400"> · @{p.usertag}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {renter && (
          <>
            <label className="block text-[12px] font-medium text-zinc-700 mb-1">{t("renterEmailLabel")}</label>
            <input
              value={renterEmail}
              onChange={(e) => setRenterEmail(e.target.value)}
              placeholder={t("renterEmailPlaceholder")}
              type="email"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] mb-3 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </>
        )}

        <label className="block text-[12px] font-medium text-zinc-700 mb-1">{t("totalLabel")}</label>
        <input
          value={totalAmount}
          onChange={(e) => setTotalAmount(e.target.value)}
          placeholder="2000.00"
          inputMode="decimal"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] mb-3 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
        />

        <label className="block text-[12px] font-medium text-zinc-700 mb-1">{t("depositLabel")}</label>
        <input
          value={depositPercent}
          onChange={(e) => setDepositPercent(e.target.value)}
          inputMode="numeric"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] mb-1 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
        />
        {depositPreview && (
          <p className="text-[12px] text-zinc-500 mb-3">{t("depositPreview", { amount: depositPreview })}</p>
        )}

        {error && <p className="text-[12px] text-red-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">{tc("cancel")}</button>
          <button
            onClick={startBooking}
            disabled={submitting || !renter || !renterEmail.trim() || !totalAmount}
            className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
          >
            {submitting ? t("starting") : t("createLink")}
          </button>
        </div>
      </ModalShell>
    );
  }

  // ── Booking exists: status + the next action, if any ───────────────
  const b = booking;
  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-3">{t("statusTitle")}</h3>

      <div className="space-y-1.5 mb-4 text-[13px]">
        <div className="flex justify-between"><span className="text-zinc-500">{t("renterLabel")}</span><span className="text-zinc-900 font-medium">{b.bookedByUser?.name || b.bookedByUser?.usertag}</span></div>
        <div className="flex justify-between"><span className="text-zinc-500">{t("totalLabel")}</span><span className="text-zinc-900 font-medium">{formatCents(b.totalAmountCents || 0, b.currency)}</span></div>
        <div className="flex justify-between"><span className="text-zinc-500">{t("depositLineLabel", { pct: b.depositPercent ?? 0 })}</span><span className="text-zinc-900 font-medium">{formatCents(b.depositAmountCents || 0, b.currency)} {b.depositPaidAt ? "✓" : `(${t("pending")})`}</span></div>
        {b.status !== "DEPOSIT_PENDING" && (
          <div className="flex justify-between"><span className="text-zinc-500">{t("remainderLabel")}</span><span className="text-zinc-900 font-medium">{formatCents((b.totalAmountCents || 0) - (b.depositAmountCents || 0), b.currency)}</span></div>
        )}
      </div>

      {b.status === "DEPOSIT_PENDING" && (
        <div className="rounded-lg bg-amber-50 p-3 mb-3">
          <p className="text-sm font-medium text-amber-700">{t("waitingDepositTitle")}</p>
          <p className="text-xs text-amber-600 mt-0.5">{t("waitingDepositBody")}</p>
        </div>
      )}

      {b.status === "DEPOSIT_PAID" && (
        <>
          <label className="block text-[12px] font-medium text-zinc-700 mb-1">{t("extraLabel")}</label>
          <input
            value={extraAmount}
            onChange={(e) => setExtraAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] mb-3 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
          <p className="text-[12px] text-zinc-500 mb-3">{t("chargeExplainer")}</p>
        </>
      )}

      {b.status === "FINAL_INVOICE_OPEN" && (
        <div className="rounded-lg bg-blue-50 p-3 mb-3">
          <p className="text-sm font-medium text-blue-700">{t("invoiceOpenTitle")}</p>
          <p className="text-xs text-blue-600 mt-0.5">{t("invoiceOpenBody")}</p>
        </div>
      )}

      {b.status === "FINAL_INVOICE_PAID" && (
        <div className="rounded-lg bg-emerald-50 p-3 mb-3">
          <p className="text-sm font-medium text-emerald-700">{t("fullyPaidTitle")}</p>
        </div>
      )}

      {b.status === "FINAL_INVOICE_FAILED" && (
        <div className="rounded-lg bg-red-50 p-3 mb-3">
          <p className="text-sm font-medium text-red-700">{t("invoiceFailedTitle")}</p>
          <p className="text-xs text-red-600 mt-0.5">{t("invoiceFailedBody")}</p>
        </div>
      )}

      {error && <p className="text-[12px] text-red-600 mb-3">{error}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">{tc("close")}</button>
        {b.status === "DEPOSIT_PAID" && (
          <button
            onClick={chargeFinalInvoice}
            disabled={charging}
            className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
          >
            {charging ? t("charging") : t("chargeFinalInvoice")}
          </button>
        )}
      </div>
    </ModalShell>
  );
}
