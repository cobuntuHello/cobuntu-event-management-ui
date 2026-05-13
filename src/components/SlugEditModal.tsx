"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useEventManagementConfig, useJsonHeaders } from "../config";

export interface SlugEditModalProps {
  event: any;
  communityTag: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
  /**
   * Called when the slug successfully changes. The consumer should
   * navigate to the new URL — admin app uses
   * `/${communityTag}/events/${newSlug}`; the community-app uses
   * `/manage/${newSlug}` or similar. The component does NOT navigate
   * itself.
   */
  onSlugChanged?: (newSlug: string) => void;
}

export function SlugEditModal({ event, communityTag, onClose, onSaved, showToast, onSlugChanged }: SlugEditModalProps) {
  const { apiBaseUrl } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [slug, setSlug] = useState(event.slug || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!slug.trim()) return;
    const normalizedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/slug`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ slug: normalizedSlug }),
      });
      if (res.ok) {
        const data = await res.json();
        const newSlug = data.slug || normalizedSlug;
        showToast("Slug updated");
        onSlugChanged?.(newSlug);
        onSaved();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to update slug");
      }
    } catch {
      showToast("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Edit event slug</h3>
      <p className="text-[12px] text-zinc-400 mb-4">URL-friendly identifier for your event.</p>
      <input
        type="text"
        value={slug}
        onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
        autoFocus
        className="w-full px-3 py-2.5 text-sm text-zinc-900 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 placeholder:text-zinc-400 font-mono"
      />
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
        <button
          onClick={save}
          disabled={saving || !slug.trim()}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}
