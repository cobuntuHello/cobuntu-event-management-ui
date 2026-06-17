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
    <ModalShell onClose={onClose} width="w-full sm:w-[560px]">
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

      {/* ─── Detail source ──────────────────────────────────────
          Two large tap-target tiles instead of radio rows. Better on
          mobile (full-finger hit targets), clearer affordance, and
          the icons + descriptions give hosts a visual cue of the
          choice. Selected tile gets a zinc-900 ring + check badge.

          Native radio inputs stay in the DOM (sr-only) so the form
          remains accessible to keyboard + screen-reader users. */}
      <div className="py-3 border-b border-zinc-100">
        <div className="text-[13px] font-medium text-zinc-900 mb-3">Event detail page</div>
        <div role="radiogroup" aria-label="Event detail page" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DetailSourceTile
            selected={detailSource === "NATIVE"}
            onClick={() => setDetailSource("NATIVE")}
            title="Cobuntu event page"
            description="Cobuntu renders the detail page with your title, banner, agenda, hosts, and Buy Ticket flow."
            inputName="detailSource"
            inputValue="NATIVE"
            icon={(
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 9h18" />
                <path d="M7 14h6" />
                <path d="M7 17h4" />
              </svg>
            )}
          />
          <DetailSourceTile
            selected={detailSource === "EXTERNAL"}
            onClick={() => setDetailSource("EXTERNAL")}
            title="Custom landing page"
            description={`/events/${event.slug} 302-redirects to your URL. Payments + RSVPs still flow through Cobuntu via the public API.`}
            inputName="detailSource"
            inputValue="EXTERNAL"
            icon={(
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1" />
                <path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1" />
              </svg>
            )}
          />
        </div>

        {detailSource === "EXTERNAL" && (
          <div className="mt-4">
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
              Your custom page should call Cobuntu's public API for live tier prices and the Buy Ticket button. See Integrations → Documentation.
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

/**
 * Large tap-target tile used by the Distribution modal in place of a
 * radio row. Renders a labelled card with an icon, title, description,
 * and an in-corner check badge when selected. A visually-hidden native
 * radio input sits inside so the change is form-friendly + accessible
 * to keyboard / screen-reader users; clicks on the outer tile fire the
 * onClick prop directly.
 */
function DetailSourceTile({
  selected,
  onClick,
  title,
  description,
  inputName,
  inputValue,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
  inputName: string;
  inputValue: string;
  icon: React.ReactNode;
}) {
  return (
    <label
      className={`relative flex flex-col gap-2 px-4 py-3.5 rounded-xl border-2 cursor-pointer transition-colors ${
        selected
          ? "border-zinc-900 bg-zinc-50"
          : "border-zinc-200 bg-white hover:bg-zinc-50/60"
      }`}
    >
      {/* Sr-only native input so keyboard + form behaviour stays correct. */}
      <input
        type="radio"
        name={inputName}
        value={inputValue}
        checked={selected}
        onChange={onClick}
        className="sr-only"
      />
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selected ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"}`}>
          {icon}
        </div>
        {selected && (
          <span className="w-5 h-5 rounded-full bg-zinc-900 text-white flex items-center justify-center shrink-0" aria-hidden>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
      </div>
      <div>
        <div className="text-[13px] font-semibold text-zinc-900">{title}</div>
        <div className="text-[11.5px] text-zinc-500 mt-1 leading-snug">{description}</div>
      </div>
    </label>
  );
}
