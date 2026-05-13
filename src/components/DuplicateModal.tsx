"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useEventManagementConfig } from "../config";

export interface DuplicateModalProps {
  event: any;
  communityTag: string;
  onClose: () => void;
  showToast: (msg: string) => void;
  /**
   * Called when the duplicate succeeds. Receives the new event from the
   * backend's response (typically `{ event: { id, slug }, ... }`). The
   * consumer navigates to its preferred URL — admin uses
   * `/${communityTag}/events/${newId}`; community-app uses
   * `/events/${newSlug}/manage`. The component does NOT navigate itself.
   */
  onDuplicated?: (newEvent: { id?: string; slug?: string }) => void;
}

export function DuplicateModal({ event, communityTag, onClose, showToast, onDuplicated }: DuplicateModalProps) {
  const { apiBaseUrl, authHeaders } = useEventManagementConfig();
  const [saving, setSaving] = useState(false);

  async function execute() {
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}/duplicate`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const newEvent = {
          id: data.event?.id || data.id,
          slug: data.event?.slug || data.slug,
        };
        if (newEvent.id || newEvent.slug) {
          showToast("Event duplicated");
          onDuplicated?.(newEvent);
        }
      } else {
        showToast("Failed to duplicate");
      }
    } catch {
      showToast("Failed to duplicate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-2">Duplicate event</h3>
      <p className="text-[13px] text-zinc-500 mb-4">
        Creates a copy of &ldquo;{event.name}&rdquo; as a new draft with the same details, pricing, and settings.
      </p>
      <div className="rounded-lg bg-zinc-50 p-3 mb-4">
        <p className="text-[12px] font-medium text-zinc-600 mb-1">What&apos;s next after duplicating:</p>
        <ul className="text-[12px] text-zinc-500 space-y-0.5 list-disc list-inside">
          <li>Set new dates for the event</li>
          <li>Add listings to communities</li>
          <li>Publish when ready</li>
        </ul>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
        <button onClick={execute} disabled={saving}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer">
          {saving ? "Duplicating..." : "Duplicate"}
        </button>
      </div>
    </ModalShell>
  );
}
