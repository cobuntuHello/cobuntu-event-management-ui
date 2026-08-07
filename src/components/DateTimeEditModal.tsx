"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { EventTimestamps } from "../ui/event-timestamps";
import { useUpdateEvent } from "../config";

/**
 * Event times are stored UTC with the intended wall-clock timezone alongside
 * (`events.timezone`). Everything the organiser sees and edits in this modal is
 * wall clock IN THAT ZONE, never the browser's. The browser's own zone must not
 * appear in any calculation here: an organiser in New York editing a Lisbon
 * event has to see and save Lisbon time.
 *
 * The helpers below therefore route every conversion through
 * `Intl.DateTimeFormat` with an explicit `timeZone` and `Date.UTC`, and never
 * through the local-time `Date` getters/constructor. The one exception is the
 * `Date` handed to the date picker, which is deliberately built at LOCAL
 * midnight carrying the event-zone calendar date, so the picker (which reads
 * local getters) displays the right day. `dateTimeToUTC` reads the same local
 * getters back, so the pair stays consistent.
 */

/** Wall-clock HH:MM that `timeZone` shows at this instant. */
function formatTimeInTimezone(
  utcDate: Date | string | null | undefined,
  timezone: string
): string {
  if (!utcDate) return "15:00";
  const date = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  if (Number.isNaN(date.getTime())) return "15:00";
  // hourCycle h23 rather than hour12:false — some ICU builds render midnight as
  // "24:00" under hour12:false, which would round-trip to the wrong day.
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).format(date);
}

/**
 * The calendar date `timeZone` is on at this instant, returned as a Date at
 * LOCAL midnight so the date picker renders the event-zone day.
 *
 * Without this the picker showed the BROWSER's day: an event at 23:00Z is
 * July 2nd in Lisbon but July 1st in New York, so a NY organiser opening it saw
 * the 1st and saving moved the event back a day.
 */
function dateInTimezone(
  utcDate: Date | string | null | undefined,
  timezone: string
): Date | null {
  if (!utcDate) return null;
  const date = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  if (Number.isNaN(date.getTime())) return null;
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  })
    .format(date)
    .match(/\d+/g)!
    .map(Number);
  return new Date(y!, m! - 1, d!);
}

/**
 * `timeZone`'s offset from UTC at a given instant, in ms. Positive east of
 * Greenwich. Derived by reading the zone's wall clock back as if it were UTC.
 */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const [y, mo, d, h, mi, s] = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  })
    .format(instant)
    .match(/\d+/g)!
    .map(Number);
  return Date.UTC(y!, mo! - 1, d!, h!, mi!, s!) - instant.getTime();
}

/**
 * Wall clock (`date`'s calendar day + `timeStr`) in `timezone` → UTC ISO string.
 *
 * Two passes: the offset depends on the instant, and the instant depends on the
 * offset. The first pass guesses using the offset at the wall time read as UTC;
 * the second re-reads the offset at that guess, which lands the DST-transition
 * days correctly.
 */
function dateTimeToUTC(date: Date, timeStr: string, timezone: string): string {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const wallAsUTC = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours || 0,
    minutes || 0,
    0
  );
  let ms = wallAsUTC - tzOffsetMs(new Date(wallAsUTC), timezone);
  ms = wallAsUTC - tzOffsetMs(new Date(ms), timezone);
  return new Date(ms).toISOString();
}

interface Props {
  event: any;
  communityTag: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}

export function DateTimeEditModal({ event, communityTag, onClose, onSaved, showToast }: Props) {
  const updateEvent = useUpdateEvent();
  const tz = event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Both halves of the picker are seeded in the EVENT's zone, not the browser's
  // — see the helper block above.
  const [startDate, setStartDate] = useState<Date | null>(dateInTimezone(event.startDate, tz));
  const [endDate, setEndDate] = useState<Date | null>(dateInTimezone(event.endDate, tz));
  const [startTime, setStartTime] = useState(formatTimeInTimezone(event.startDate, tz));
  const [endTime, setEndTime] = useState(formatTimeInTimezone(event.endDate, tz));
  const [timezone, setTimezone] = useState(tz);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!startDate || !endDate) return;
    setSaving(true);
    try {
      const startDateUTC = dateTimeToUTC(startDate, startTime, timezone);
      const endDateUTC = dateTimeToUTC(endDate, endTime, timezone);
      await updateEvent(communityTag, event.id, {
        startDate: startDateUTC,
        endDate: endDateUTC,
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
    <ModalShell onClose={onClose} width="w-full sm:w-[540px]">
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
