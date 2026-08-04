"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useEventManagementConfig, useJsonHeaders } from "../config";

export interface AfterCheckoutEditModalProps {
  event: any;
  communityTag: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}

type Mode = "NATIVE" | "MEMBERSHIP_UPSELL" | "EXTERNAL";
interface Segment { id: string; name: string }

/**
 * After checkout — feat/purchase-flow-upsell.
 *
 * Per-event choice of what a buyer sees AFTER paying for this community-owned
 * event: the normal Cobuntu confirmation (NATIVE), a membership upsell to a
 * promoted tier (MEMBERSHIP_UPSELL), or a 302 to the community's own
 * post-checkout page (EXTERNAL). Distinct from Distribution, which controls the
 * PRE-purchase detail page. Configuring it requires EVENTS_CREATE — the backend
 * re-enforces that gate, so a member host of their own event can't set it.
 */
export function AfterCheckoutEditModal({
  event,
  communityTag,
  onClose,
  onSaved,
  showToast,
}: AfterCheckoutEditModalProps) {
  const { apiBaseUrl } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();

  const [mode, setMode] = useState<Mode>(
    event.afterCheckoutMode === "MEMBERSHIP_UPSELL" || event.afterCheckoutMode === "EXTERNAL"
      ? event.afterCheckoutMode
      : "NATIVE",
  );
  const [segmentId, setSegmentId] = useState<string>(event.upsellSegmentId || "");
  const [headline, setHeadline] = useState<string>(event.upsellHeadline || "");
  const [ctaLabel, setCtaLabel] = useState<string>(event.upsellCtaLabel || "");
  const [postCheckoutUrl, setPostCheckoutUrl] = useState<string>(event.postCheckoutUrl || "");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/segments`, { headers: jsonHeaders() });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.segments || [];
        if (!cancelled) setSegments(list.map((s: any) => ({ id: s.id, name: s.name })));
      } catch { /* leave empty */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const urlValid = mode !== "EXTERNAL" || /^https:\/\/[^\s]+$/.test(postCheckoutUrl.trim());
  const segmentValid = mode !== "MEMBERSHIP_UPSELL" || !!segmentId;

  async function save() {
    if (!urlValid) { showToast("Post-checkout URL must be a valid https:// URL"); return; }
    if (!segmentValid) { showToast("Choose a membership tier to promote"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/after-checkout`, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({
          afterCheckoutMode: mode,
          upsellSegmentId: mode === "MEMBERSHIP_UPSELL" ? segmentId : null,
          upsellHeadline: mode === "MEMBERSHIP_UPSELL" ? headline.trim() || null : null,
          upsellCtaLabel: mode === "MEMBERSHIP_UPSELL" ? ctaLabel.trim() || null : null,
          postCheckoutUrl: mode === "EXTERNAL" ? postCheckoutUrl.trim() : null,
        }),
      });
      if (res.ok) {
        showToast("After checkout updated");
        onSaved();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to update after checkout");
      }
    } catch {
      showToast("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full px-3 py-2 text-[13px] border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-400 border-zinc-200 focus:border-zinc-400";

  return (
    <ModalShell onClose={onClose} width="w-full sm:w-[560px]">
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">After checkout</h3>
      <p className="text-[12px] text-zinc-400 mb-4">
        What a buyer sees after paying for this event. This is the page after payment, not the event page.
      </p>

      <div role="radiogroup" aria-label="After checkout" className="grid grid-cols-1 gap-2">
        {([
          { v: "NATIVE", title: "Normal confirmation", description: "The standard Cobuntu confirmation with the ticket, receipt, and downloads." },
          { v: "MEMBERSHIP_UPSELL", title: "Membership upsell", description: "Offer the buyer a community membership after their ticket. Only shown to people who aren't already members." },
          { v: "EXTERNAL", title: "External redirect", description: "Send the buyer to your own post-checkout page." },
        ] as const).map((opt) => (
          <label
            key={opt.v}
            className={`relative flex gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-colors ${
              mode === opt.v ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50/60"
            }`}
          >
            <input type="radio" name="afterCheckoutMode" value={opt.v} checked={mode === opt.v} onChange={() => setMode(opt.v)} className="sr-only" />
            <span className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center ${mode === opt.v ? "border-zinc-900" : "border-zinc-300"}`}>
              {mode === opt.v && <span className="w-2 h-2 rounded-full bg-zinc-900" />}
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-zinc-900">{opt.title}</span>
              <span className="block text-[11.5px] text-zinc-500 mt-0.5 leading-snug">{opt.description}</span>
            </span>
          </label>
        ))}
      </div>

      {mode === "MEMBERSHIP_UPSELL" && (
        <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4">
          <label className="block text-[12px] font-medium text-zinc-700">Promoted membership tier</label>
          <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className={input}>
            <option value="">Choose a tier…</option>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline (optional)" maxLength={140} className={input} />
          <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Button label (optional)" maxLength={40} className={input} />
        </div>
      )}

      {mode === "EXTERNAL" && (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <label className="block text-[12px] font-medium text-zinc-700 mb-1.5">Post-checkout URL</label>
          <input
            type="url"
            value={postCheckoutUrl}
            onChange={(e) => setPostCheckoutUrl(e.target.value)}
            placeholder="https://your-site.com/thank-you"
            className={`w-full px-3 py-2 text-[13px] font-mono border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-400 ${
              postCheckoutUrl && !urlValid ? "border-red-300 focus:border-red-400" : "border-zinc-200 focus:border-zinc-400"
            }`}
          />
          {postCheckoutUrl && !urlValid && <p className="text-[11px] text-red-600 mt-1">Must be a valid https:// URL.</p>}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
        <button
          onClick={save}
          disabled={saving || !urlValid || !segmentValid}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}
