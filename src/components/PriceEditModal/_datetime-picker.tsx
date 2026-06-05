"use client";

import * as React from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * Self-contained date + time picker used by the tier auto-schedule
 * window. Replaces the native <input type="datetime-local"> (which
 * renders inconsistently across browsers/OSes and clashes with the
 * modal's visual language). A button shows the formatted value; clicking
 * opens a popover with a month calendar grid + an hour/minute selector.
 *
 * Value contract mirrors the old inputs: an ISO 8601 string when set,
 * "" when cleared — so the surrounding draft/save plumbing is unchanged.
 */

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MIN_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDisplay(d: Date): string {
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface DateTimePickerProps {
  /** ISO 8601 string when set; "" when unset. */
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Select date & time",
  ariaLabel,
}: DateTimePickerProps) {
  const parsed = value ? new Date(value) : null;
  const valid = !!parsed && !Number.isNaN(parsed.getTime());
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState(() => {
    const base = valid ? (parsed as Date) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Land the calendar on the selected month each time it opens.
  React.useEffect(() => {
    if (open && valid && parsed) {
      setView({ year: parsed.getFullYear(), month: parsed.getMonth() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hours = valid ? (parsed as Date).getHours() : 9;
  const minutes = valid ? (parsed as Date).getMinutes() : 0;
  const minuteOpts = MIN_STEPS.includes(minutes) ? MIN_STEPS : [...MIN_STEPS, minutes].sort((a, b) => a - b);

  function pickDay(day: number) {
    const d = valid ? new Date(parsed as Date) : new Date();
    d.setFullYear(view.year, view.month, day);
    if (!valid) d.setHours(9, 0, 0, 0);
    onChange(d.toISOString());
  }

  function setTime(h: number, m: number) {
    const d = valid ? new Date(parsed as Date) : new Date(view.year, view.month, new Date().getDate());
    d.setHours(h, m, 0, 0);
    onChange(d.toISOString());
  }

  const { year, month } = view;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
  const isSel = (day: number) =>
    valid && (parsed as Date).getFullYear() === year && (parsed as Date).getMonth() === month && (parsed as Date).getDate() === day;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-[12px] px-3 py-2 border border-zinc-200 rounded-lg hover:border-zinc-300 cursor-pointer text-left transition-colors"
      >
        <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <span className={valid ? "text-zinc-900 truncate" : "text-zinc-400 truncate"}>
          {valid ? fmtDisplay(parsed as Date) : placeholder}
        </span>
        {valid && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="ml-auto shrink-0 text-zinc-300 hover:text-zinc-600"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {open && (
        // In-flow panel (not an absolute overlay) so it's never clipped by
        // the modal's fixed-height scroll body — it expands the content and
        // the body scrolls to it, like an accordion.
        <div className="mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-sm p-3">
          {/* Month header */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setView(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })}
              className="p-1 rounded hover:bg-zinc-100 cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4 text-zinc-500" />
            </button>
            <span className="text-[13px] font-semibold text-zinc-900">{MONTHS[month]} {year}</span>
            <button
              type="button"
              onClick={() => setView(month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })}
              className="p-1 rounded hover:bg-zinc-100 cursor-pointer"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4 text-zinc-500" />
            </button>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-medium text-zinc-400">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`pad-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const sel = isSel(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={[
                    "aspect-square flex items-center justify-center text-[12px] rounded-md cursor-pointer transition-colors",
                    sel
                      ? "bg-zinc-900 text-white font-semibold"
                      : isToday(day)
                        ? "text-zinc-900 font-semibold hover:bg-zinc-100"
                        : "text-zinc-600 hover:bg-zinc-100",
                  ].join(" ")}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Time */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-100">
            <span className="text-[11px] text-zinc-400">Time</span>
            <select
              value={hours}
              onChange={(e) => setTime(parseInt(e.target.value, 10), minutes)}
              className="text-[12px] border border-zinc-200 rounded-md px-1.5 py-1 cursor-pointer focus:outline-none focus:border-zinc-400"
              aria-label="Hour"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>{pad(h)}</option>
              ))}
            </select>
            <span className="text-zinc-400">:</span>
            <select
              value={minutes}
              onChange={(e) => setTime(hours, parseInt(e.target.value, 10))}
              className="text-[12px] border border-zinc-200 rounded-md px-1.5 py-1 cursor-pointer focus:outline-none focus:border-zinc-400"
              aria-label="Minute"
            >
              {minuteOpts.map((m) => (
                <option key={m} value={m}>{pad(m)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto text-[12px] font-medium text-zinc-900 hover:text-zinc-600 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
