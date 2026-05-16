"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { EventLocationSelector } from "../ui/event-location-selector";
import { useUpdateEvent } from "../config";

interface Props {
  event: any;
  communityTag: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}

export function LocationEditModal({ event, communityTag, onClose, onSaved, showToast }: Props) {
  const updateEvent = useUpdateEvent();
  const [physical, setPhysical] = useState(event.physicalLocation || "");
  const [online, setOnline] = useState(event.onlineUrl || "");
  // Hold the lat/lng Google Places returns alongside the selected address.
  // Without these, the community-app event detail map (gated on both being
  // non-null) silently never renders for any event saved through this modal.
  const [lat, setLat] = useState<number | null>(event.physicalLatitude ?? null);
  const [lng, setLng] = useState<number | null>(event.physicalLongitude ?? null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateEvent(communityTag, event.id, {
        physicalLocation: physical.trim() || null,
        onlineUrl: online.trim() || null,
        physicalLatitude: lat,
        physicalLongitude: lng,
      });
      showToast("Location updated");
      onSaved();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} width="w-[480px]">
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-4">Edit location</h3>
      <EventLocationSelector
        physicalLocation={physical}
        onlineUrl={online}
        onPhysicalLocationChange={setPhysical}
        onOnlineUrlChange={setOnline}
        onCoordinatesChange={(nextLat, nextLng) => {
          setLat(nextLat);
          setLng(nextLng);
        }}
        hideHeader
      />
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}
