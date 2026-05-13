"use client";

import { ModalShell } from "../ui/modal-shell";

interface Props {
  event: any;
  isPaid: boolean;
  attendeeCount: number;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteModal({ event, isPaid, attendeeCount, onClose, onConfirm }: Props) {
  const startDate = event?.startDate ? new Date(event.startDate) : null;

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-3">Delete event</h3>
      <div className="space-y-2 mb-4">
        <div className="rounded-lg bg-zinc-50 p-3 flex gap-3">
          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-zinc-200">
            {event.bannerUrl && <img src={event.bannerUrl} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-900 truncate">{event.name}</p>
            <p className="text-xs text-zinc-500">{startDate ? startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : ""}</p>
          </div>
        </div>
        {attendeeCount > 0 && (
          <WarnCard color="amber" title={`${attendeeCount} ${attendeeCount === 1 ? "person is" : "people are"} registered`} subtitle="Attendees will be notified about the cancellation." />
        )}
        {isPaid && (
          <WarnCard color="blue" title="Automatic refunds" subtitle="All ticket purchases still in escrow will be automatically refunded." />
        )}
        <WarnCard color="red" title="This is permanent" subtitle="The event and all associated data will be permanently deleted." />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
        <button onClick={onConfirm} className="px-4 py-2 text-[13px] font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer">Delete Event</button>
      </div>
    </ModalShell>
  );
}

function WarnCard({ color, title, subtitle }: { color: "amber" | "blue" | "red"; title: string; subtitle: string }) {
  const styles = {
    amber: { bg: "bg-amber-50", icon: "text-amber-500", title: "text-amber-700", sub: "text-amber-600" },
    blue: { bg: "bg-blue-50", icon: "text-blue-500", title: "text-blue-700", sub: "text-blue-600" },
    red: { bg: "bg-red-50", icon: "text-red-500", title: "text-red-700", sub: "text-red-600" },
  }[color];
  const icons = {
    amber: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    blue: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>,
    red: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  }[color];
  return (
    <div className={`rounded-lg ${styles.bg} p-3 flex gap-3`}>
      <div className={`${styles.icon} shrink-0 mt-0.5`}>{icons}</div>
      <div>
        <p className={`text-sm font-medium ${styles.title}`}>{title}</p>
        <p className={`text-xs ${styles.sub} mt-0.5`}>{subtitle}</p>
      </div>
    </div>
  );
}
