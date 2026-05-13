"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { EventTimestamps } from "../ui/event-timestamps";
import { useUpdateEvent } from "../config";

interface Props {
  event: any;
  communityTag: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}

export function DateTimeEditModal({ event, communityTag, onClose, onSaved, showToast }: Props) {
  const updateEvent = useUpdateEvent();
  const sd = event.startDate ? new Date(event.startDate) : null;
  const ed = event.endDate ? new Date(event.endDate) : null;

  const [startDate, setStartDate] = useState<Date | null>(sd);
  const [endDate, setEndDate] = useState<Date | null>(ed);
  const [startTime, setStartTime] = useState(sd ? sd.toTimeString().slice(0, 5) : "15:00");
  const [endTime, setEndTime] = useState(ed ? ed.toTimeString().slice(0, 5) : "16:00");
  const [timezone, setTimezone] = useState(event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!startDate || !endDate) return;
    const s = new Date(startDate);
    const [sh, sm] = startTime.split(":").map(Number);
    s.setHours(sh, sm, 0, 0);
    const e = new Date(endDate);
    const [eh, em] = endTime.split(":").map(Number);
    e.setHours(eh, em, 0, 0);
    setSaving(true);
    try {
      await updateEvent(communityTag, event.id, {
        startDate: s.toISOString(),
        endDate: e.toISOString(),
        timezone,
      });
      showToast("Date updated");
      onSaved();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} width="w-[540px]">
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-4">Edit date & time</h3>
      <EventTimestamps
        startDate={startDate}
        endDate={endDate}
        startTime={startTime}
        endTime={endTime}
        timezone={timezone}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onStartTimeChange={setStartTime}
        onEndTimeChange={setEndTime}
        onTimezoneChange={setTimezone}
      />
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
        <button
          onClick={save}
          disabled={saving || !startDate || !endDate}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}
