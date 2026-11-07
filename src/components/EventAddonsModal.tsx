"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useEventManagementConfig, useJsonHeaders } from "../config";
import { useEventT } from "../create-wizard/i18n";

/**
 * feat/event-addon-charging (cobuntu-backend-monorepo) — the admin side of
 * picking + paying for an event's community add-ons (lights, sound,
 * security, ...). See docs/features/event-addon-charging.md there for the
 * full design.
 *
 * Same "quick-action modal with a real Stripe side effect" category as
 * PrivateHireModal, which this mirrors closely: picking add-ons is a form,
 * but paying for them fires a real charge the moment you click.
 *
 * Decided with Diogo: the host pays UPFRONT, at PUBLISH, non-refundable —
 * once any selection is PAID the whole set locks (publishEvent itself
 * refuses to publish while any selection is still unpaid, so this modal's
 * "pay now" step is not optional once add-ons are picked).
 *
 * Talks to:
 *   GET  /api/communities/:tag/my-addons?contentType=EVENT   (the catalog, already priced for this viewer)
 *   GET  /api/communities/:tag/events/:id/addons             (this event's current selections)
 *   PUT  /api/communities/:tag/events/:id/addons              (replace the selection wholesale)
 *   POST /api/communities/:tag/events/:id/addons/checkout     (pay for every unpaid selection)
 */

interface OfferedAddon {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  sortOrder: number;
}

type SelectionStatus = "PENDING" | "PAID";

interface Selection {
  id: string;
  addonId: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  status: SelectionStatus;
  paidAt: string | null;
}

interface Props {
  event: { id: string; name: string };
  communityTag: string;
  onClose: () => void;
}

function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function EventAddonsModal({ event, communityTag, onClose }: Props) {
  const { apiBaseUrl, authHeaders } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const t = useEventT("eventsUi.manageUi.eventAddonsModal");
  const tc = useEventT("eventsUi.manageUi.overviewCommon");

  const [loading, setLoading] = useState(true);
  const [offered, setOffered] = useState<OfferedAddon[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [chosenIds, setChosenIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const locked = selections.some((s) => s.status === "PAID");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [offersRes, selectionsRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/communities/${communityTag}/my-addons?contentType=EVENT`, { headers: authHeaders() }),
        fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/addons`, { headers: authHeaders() }),
      ]);
      if (!offersRes.ok) throw new Error((await offersRes.json().catch(() => ({})))?.error || t("errLoadFailed"));
      if (!selectionsRes.ok) throw new Error((await selectionsRes.json().catch(() => ({})))?.error || t("errLoadFailed"));
      const offersData = await offersRes.json();
      const selectionsData = await selectionsRes.json();
      setOffered(offersData.addons ?? []);
      setSelections(selectionsData.selections ?? []);
      setChosenIds(new Set((selectionsData.selections ?? []).map((s: Selection) => s.addonId)));
    } catch (err: any) {
      setError(err?.message || t("errLoadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(addonId: string) {
    if (locked) return;
    setChosenIds((prev) => {
      const next = new Set(prev);
      if (next.has(addonId)) next.delete(addonId);
      else next.add(addonId);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/addons`,
        { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ addonIds: Array.from(chosenIds) }) },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || t("errSaveFailed"));
      const data = await res.json();
      setSelections(data.selections ?? []);
    } catch (err: any) {
      setError(err?.message || t("errSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function payNow() {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/addons/checkout`,
        {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({
            successUrl: typeof window !== "undefined" ? window.location.href : "",
            cancelUrl: typeof window !== "undefined" ? window.location.href : "",
          }),
        },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || t("errPayFailed"));
      const data = await res.json();
      setCheckoutUrl(data.checkoutUrl);
    } catch (err: any) {
      setError(err?.message || t("errPayFailed"));
    } finally {
      setPaying(false);
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

  const unpaidCents = selections.filter((s) => s.status === "PENDING").reduce((sum, s) => sum + s.priceCents, 0);
  const currency = selections[0]?.currency || "EUR";
  const dirty = !locked && (
    chosenIds.size !== selections.length ||
    Array.from(chosenIds).some((id) => !selections.some((s) => s.addonId === id))
  );

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">{t("title")}</h3>
      <p className="text-[12px] text-zinc-500 mb-3">{t("subtitle")}</p>

      {locked && (
        <div className="rounded-lg bg-emerald-50 p-3 mb-3">
          <p className="text-sm font-medium text-emerald-700">{t("lockedTitle")}</p>
          <p className="text-xs text-emerald-600 mt-0.5">{t("lockedBody")}</p>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {offered.length === 0 && (
          <p className="text-[13px] text-zinc-500">{t("noneOffered")}</p>
        )}
        {offered.map((a) => {
          const on = chosenIds.has(a.id);
          const paidSelection = selections.find((s) => s.addonId === a.id && s.status === "PAID");
          return (
            <button
              key={a.id}
              type="button"
              disabled={locked}
              onClick={() => toggle(a.id)}
              className={`w-full flex items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                on ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"
              } ${locked ? "cursor-default" : "cursor-pointer hover:border-zinc-400"}`}
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-zinc-900">
                  {a.name}
                  {paidSelection ? <span className="ml-1.5 text-[11px] font-normal text-emerald-600">{t("paidBadge")}</span> : null}
                </p>
                {a.description && <p className="text-[12px] text-zinc-500 mt-0.5">{a.description}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[13px] font-medium text-zinc-900">
                  {a.priceCents === 0 ? t("free") : formatCents(a.priceCents)}
                </span>
                <span
                  aria-hidden="true"
                  className={`h-4 w-4 rounded border flex items-center justify-center ${
                    on ? "bg-zinc-900 border-zinc-900" : "border-zinc-300"
                  }`}
                >
                  {on && <span className="h-1.5 w-1.5 rounded-sm bg-white" />}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {error && <p className="text-[12px] text-red-600 mb-3">{error}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">
          {tc("close")}
        </button>
        {!locked && dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
          >
            {saving ? t("saving") : t("saveSelection")}
          </button>
        )}
        {!locked && !dirty && unpaidCents > 0 && (
          <button
            onClick={payNow}
            disabled={paying}
            className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
          >
            {paying ? t("paying") : t("payNow", { amount: formatCents(unpaidCents, currency) })}
          </button>
        )}
      </div>
    </ModalShell>
  );
}
