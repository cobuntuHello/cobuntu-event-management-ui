"use client";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Props {
  event: any;
}

export function EventMiniCalendar({ event }: Props) {
  const startDate = event?.startDate ? new Date(event.startDate) : null;
  const endDate = event?.endDate ? new Date(event.endDate) : startDate;

  if (!startDate) return null;

  const year = startDate.getFullYear();
  const month = startDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date();

  function isEventDay(day: number) {
    if (!startDate || !endDate) return false;
    const d = new Date(year, month, day);
    const s = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const e = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return d >= s && d <= e;
  }

  function isToday(day: number) {
    return year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
        <h3 className="text-sm font-semibold text-zinc-900">{MONTHS[month]} {year}</h3>
      </div>
      <div className="px-6 py-4">
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map(d => (
            <div key={d} className="text-[11px] font-medium text-zinc-400 text-center py-1">{d}</div>
          ))}
          {cells.map((day, i) => (
            <div key={i} className="flex items-center justify-center py-0.5">
              {day ? (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] transition-colors ${
                  isEventDay(day)
                    ? "bg-zinc-900 text-white font-semibold"
                    : isToday(day)
                    ? "ring-1.5 ring-zinc-300 font-medium text-zinc-900"
                    : "text-zinc-500"
                }`}>
                  {day}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
