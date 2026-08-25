"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { LAYERS } from "@cobuntu/management-ui-shared";

/**
 * Self-contained date + time picker for the tier auto-schedule window.
 *
 * The calendar opens as a **portaled popover** (fixed-positioned at
 * document.body, z above the modal) rather than expanding in-flow — so it
 * never pushes/extends the modal and is never clipped by the modal's
 * fixed-height scroll body. Time uses the app's custom Select (no native
 * <select>). Value contract: ISO 8601 string when set, "" when cleared.
 */

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MIN_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const POP_H = 388;

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
  const [coords, setCoords] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const [view, setView] = React.useState(() => {
    const base = valid ? (parsed as Date) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);

  const computeCoords = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    // Prefer below; flip above when there isn't room below but there is above.
    const top = spaceBelow >= POP_H + 8 || spaceBelow >= r.top
      ? r.bottom + 6
      : Math.max(8, r.top - POP_H - 6);
    // Match the trigger's EXACT width + left edge so the popover is
    // perfectly aligned with its input (same left + same width = same
    // right). The calendar grid is responsive and fits the input width.
    const width = r.width;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setCoords({ top, left, width });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    computeCoords();
    if (valid && parsed) setView({ year: parsed.getFullYear(), month: parsed.getMonth() });

    function reposition() { computeCoords(); }
    function onDocPointer(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || popRef.current?.contains(target)) return;
      // Ignore clicks inside the custom Select's portaled dropdown.
      if (target.closest?.("[data-radix-popper-content-wrapper]")) return;
      setOpen(false);
    }
    // capture: also catch scrolls on the modal's inner scroll container.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("mousedown", onDocPointer);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onDocPointer);
    };
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
    <>
      <button
        ref={triggerRef}
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

      {open && coords && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          /*
            * ABOVE THE MODAL IT OPENS FROM, taken from the shared scale rather
            * than picked here.
            *
            * This was z-[60] and ModalShell is z-[120], so the calendar opened
            * BEHIND the modal that contains it -- both portal to document.body,
            * so they are siblings and 60 simply loses. It was correct when
            * written, against a shell that was then z-50, and stayed at 60 when
            * the shell moved in August. Nothing connected the two numbers.
            *
            * LAYERS is that connection, and a test asserts the ordering.
            */
          className="rounded-xl border border-zinc-200 bg-white shadow-xl p-3"
          style={{ zIndex: LAYERS.popoverInModal, position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
        >
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

          {/* Time — custom Select dropdowns (no native <select>). The
              dropdown content takes LAYERS.popoverChild, which is above this
              popover for the same reason this popover is above the modal. */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-100">
            <span className="text-[11px] text-zinc-400">Time</span>
            <Select value={String(hours)} onValueChange={(v) => setTime(parseInt(v, 10), minutes)}>
              <SelectTrigger className="h-8 w-[60px] px-2 py-1 bg-white text-[12px]" aria-label="Hour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={{ zIndex: LAYERS.popoverChild }}>
                {Array.from({ length: 24 }).map((_, h) => (
                  <SelectItem key={h} value={String(h)}>{pad(h)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-zinc-400">:</span>
            <Select value={String(minutes)} onValueChange={(v) => setTime(hours, parseInt(v, 10))}>
              <SelectTrigger className="h-8 w-[60px] px-2 py-1 bg-white text-[12px]" aria-label="Minute">
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={{ zIndex: LAYERS.popoverChild }}>
                {minuteOpts.map((m) => (
                  <SelectItem key={m} value={String(m)}>{pad(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto text-[12px] font-medium text-zinc-900 hover:text-zinc-600 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
