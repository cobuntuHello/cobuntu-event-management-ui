"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useEventManagementConfig, useJsonHeaders } from "../config";

export interface DistributionEditModalProps {
  event: any;
  communityTag: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}

type DetailSource = "NATIVE" | "EXTERNAL";

/**
 * Distribution — feat/public-events-api.
 *
 * Per-event toggle for whether cobuntu hosts the detail page (NATIVE,
 * default) or 302-redirects to a customer-controlled URL (EXTERNAL,
 * e.g. a Lovable-hosted custom design). Also exposes the `featured`
 * flag — pinning one event per community to the hero slot on cobuntu's
 * events listing AND the public API's `?featured=true` query.
 *
 * Auto-unfeature is enforced server-side: setting featured=true on this
 * event clears featured on whatever else was featured in the same
 * community in the same transaction. So no client-side juggling needed.
 */
export function DistributionEditModal({
  event,
  communityTag,
  onClose,
  onSaved,
  showToast,
}: DistributionEditModalProps) {
  const { apiBaseUrl } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [detailSource, setDetailSource] = useState<DetailSource>(
    event.detailSource === "EXTERNAL" ? "EXTERNAL" : "NATIVE",
  );
  const [externalDetailUrl, setExternalDetailUrl] = useState<string>(event.externalDetailUrl || "");
  const [featured, setFeatured] = useState<boolean>(!!event.featured);
  const [saving, setSaving] = useState(false);

  const urlValid = detailSource === "NATIVE" || /^https:\/\/[^\s]+$/.test(externalDetailUrl);

  async function save() {
    if (!urlValid) {
      showToast("External URL must be a valid https:// URL");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}`, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({
          featured,
          detailSource,
          externalDetailUrl: detailSource === "EXTERNAL" ? externalDetailUrl.trim() : null,
          notifyAttendees: false,
        }),
      });
      if (res.ok) {
        showToast("Distribution updated");
        onSaved();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to update distribution");
      }
    } catch {
      showToast("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Distribution</h3>
      <p className="text-[12px] text-zinc-400 mb-4">
        Where members land when they click this event, and whether it's the featured "big frame" slot in your header.
      </p>

      {/* ─── Featured ───────────────────────────────────────── */}
      <div className="flex items-start gap-3 py-3 border-y border-zinc-100">
        <input
          id="featured"
          type="checkbox"
          checked={featured}
          onChange={(e) => setFeatured(e.target.checked)}
          className="mt-0.5 w-4 h-4 cursor-pointer accent-zinc-900"
        />
        <label htmlFor="featured" className="flex-1 cursor-pointer">
          <div className="text-[13px] font-medium text-zinc-900">Featured event</div>
          <div className="text-[12px] text-zinc-500 mt-0.5">
            Pin this event to the hero slot on your community's events listing. Only one event per community can be featured at a time — selecting this will auto-unfeature whichever event was previously featured.
          </div>
        </label>
      </div>

      {/* ─── Detail source ──────────────────────────────────── */}
      <div className="py-3 border-b border-zinc-100">
        <div className="text-[13px] font-medium text-zinc-900 mb-2">Event detail page</div>
        <div className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="detailSource"
              checked={detailSource === "NATIVE"}
              onChange={() => setDetailSource("NATIVE")}
              className="mt-0.5 w-4 h-4 cursor-pointer accent-zinc-900"
            />
            <div className="flex-1">
              <div className="text-[13px] text-zinc-900">Use cobuntu's standard event page</div>
              <div className="text-[12px] text-zinc-500 mt-0.5">The default — cobuntu renders the detail page with your title, banner, agenda, hosts, and the Buy Ticket flow.</div>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="detailSource"
              checked={detailSource === "EXTERNAL"}
              onChange={() => setDetailSource("EXTERNAL")}
              className="mt-0.5 w-4 h-4 cursor-pointer accent-zinc-900"
            />
            <div className="flex-1">
              <div className="text-[13px] text-zinc-900">Use a custom landing page</div>
              <div className="text-[12px] text-zinc-500 mt-0.5">cobuntu's /events/{event.slug} URL 302-redirects to your URL. Payments + RSVPs still flow through cobuntu via the public API.</div>
            </div>
          </label>
        </div>

        {detailSource === "EXTERNAL" && (
          <div className="mt-3">
            <label className="block text-[12px] font-medium text-zinc-700 mb-1.5">External URL</label>
            <input
              type="url"
              value={externalDetailUrl}
              onChange={(e) => setExternalDetailUrl(e.target.value)}
              placeholder="https://your-site.com/eventos/lisboa"
              className={`w-full px-3 py-2 text-[13px] font-mono border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-400 ${
                externalDetailUrl && !urlValid ? "border-red-300 focus:border-red-400" : "border-zinc-200 focus:border-zinc-400"
              }`}
            />
            {externalDetailUrl && !urlValid && (
              <p className="text-[11px] text-red-600 mt-1">Must be a valid https:// URL.</p>
            )}
            <p className="text-[11px] text-zinc-400 mt-1.5">
              Your custom page should call cobuntu's public API for live tier prices and the Buy Ticket button. See Integrations → Documentation.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
        <button
          onClick={save}
          disabled={saving || !urlValid}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}
