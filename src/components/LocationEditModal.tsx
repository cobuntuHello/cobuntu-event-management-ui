"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { EventLocationsField, makeLocation, type EventLocationValue } from "../ui/event-locations-field";
import { useUpdateEvent } from "../config";

interface Props {
  event: any;
  communityTag: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}

/** Seed the editor from event.locations[] (Phase 2) or the legacy flat fields. */
function seedLocations(event: any): EventLocationValue[] {
  const seed = event.locations as any[] | undefined;
  if (seed && seed.length) {
    return seed.map((l, i) => ({
      key: `seed-${i}`,
      kind: l.kind,
      address: l.address || "",
      latitude: l.latitude ?? null,
      longitude: l.longitude ?? null,
      url: l.url || "",
      isPrimary: !!l.isPrimary,
    }));
  }
  const rows: EventLocationValue[] = [];
  if ((event.physicalLocation || "").trim() || (event.physicalLatitude != null && event.physicalLongitude != null)) {
    rows.push({ ...makeLocation("PHYSICAL", true), address: event.physicalLocation || "", latitude: event.physicalLatitude ?? null, longitude: event.physicalLongitude ?? null });
  }
  if ((event.onlineUrl || "").trim()) {
    rows.push({ ...makeLocation("ONLINE", rows.length === 0), url: event.onlineUrl || "" });
  }
  return rows;
}

export function LocationEditModal({ event, communityTag, onClose, onSaved, showToast }: Props) {
  const updateEvent = useUpdateEvent();
  const [locations, setLocations] = useState<EventLocationValue[]>(() => seedLocations(event));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      // Send the full set (Phase 2). The server persists locations[] as the
      // source of truth and mirrors the primary to the legacy columns, so
      // editing here never drops the event's other locations.
      const payload = locations
        .map((l, i) => ({
          kind: l.kind,
          address: l.kind === "PHYSICAL" ? (l.address.trim() || null) : null,
          latitude: l.kind === "PHYSICAL" ? l.latitude : null,
          longitude: l.kind === "PHYSICAL" ? l.longitude : null,
          url: l.kind === "ONLINE" ? (l.url.trim() || null) : null,
          isPrimary: l.isPrimary,
          sortOrder: i,
        }))
        .filter((l) => l.kind === "PHYSICAL" ? (!!l.address || (l.latitude != null && l.longitude != null)) : !!l.url);
      await updateEvent(communityTag, event.id, { locations: payload });
      showToast("Location updated");
      onSaved();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} width="w-full sm:w-[480px]">
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-4">Edit location</h3>
      <EventLocationsField value={locations} onChange={setLocations} />
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
