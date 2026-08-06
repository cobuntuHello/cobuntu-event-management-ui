"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { EventTimestamps } from "../ui/event-timestamps";
import { useUpdateEvent } from "../config";

/**
 * Format a UTC datetime as HH:MM in a specific timezone.
 * @param utcDate ISO datetime or Date object (in UTC)
 * @param timezone IANA timezone (e.g., "Europe/Lisbon")
 * @returns Time string in HH:MM format
 */
function formatTimeInTimezone(
  utcDate: Date | string | null | undefined,
  timezone: string
): string {
  if (!utcDate) return "15:00";
  const date = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  return formatter.format(date).replace(":", ":");
}

/**
 * Convert a date + time (in a specific timezone) to UTC ISO string.
 * @param date Local date (Date object)
 * @param timeStr Time in HH:MM format (in the specified timezone)
 * @param timezone IANA timezone (e.g., "Europe/Lisbon")
 * @returns UTC ISO datetime string
 */
function dateTimeToUTC(date: Date, timeStr: string, timezone: string): string {
  const [hours, minutes] = timeStr.split(":").map(Number);

  // Create a date string for the specified timezone
  // We'll use a temporary UTC date and adjust for the timezone offset
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const timeFormatted = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;

  // Create a formatter to get the offset of the timezone at this date
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: timezone,
  }).formatToParts(new Date(`${year}-${month}-${day}T${timeFormatted}:00Z`));

  // Extract parsed timezone time
  const tzParts = parts.reduce(
    (acc, p) => ({ ...acc, [p.type]: p.value }),
    {} as Record<string, string>
  );

  // Calculate the offset by comparing what we said and what the formatter returned
  const targetDateStr = `${year}-${month}-${day}T${timeFormatted}`;
  const testUTC = new Date(targetDateStr + "Z");

  const tzFormatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: timezone,
  });

  const tzTime = tzFormatter.format(testUTC);
  const [tzY, tzM, tzD, tzH, tzMin, tzS] = tzTime.match(/\d+/g)!.map(Number);

  const localDate = new Date(year, parseInt(month) - 1, parseInt(day), hours, minutes, 0);
  const offset = testUTC.getTime() - new Date(tzY, tzM - 1, tzD, tzH, tzMin, tzS).getTime();
  const utcTime = new Date(localDate.getTime() - offset);

  return utcTime.toISOString();
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
  const sd = event.startDate ? new Date(event.startDate) : null;
  const ed = event.endDate ? new Date(event.endDate) : null;

  const [startDate, setStartDate] = useState<Date | null>(sd);
  const [endDate, setEndDate] = useState<Date | null>(ed);
  // FIX: Use event's timezone instead of browser timezone for time display
  const [startTime, setStartTime] = useState(formatTimeInTimezone(event.startDate, tz));
  const [endTime, setEndTime] = useState(formatTimeInTimezone(event.endDate, tz));
  const [timezone, setTimezone] = useState(tz);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!startDate || !endDate) return;
    setSaving(true);
    try {
      // FIX: Convert times in event's timezone to UTC ISO strings
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
