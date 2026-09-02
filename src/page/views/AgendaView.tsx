"use client";

import { useState, useEffect } from "react";
import { theme, muted } from "../../shared/theme";
import { getEventManagementConfig } from "../../config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { useCanEdit } from "../../lib/manageAccess";
import { apiBase } from "../helpers";


interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  order: number;
}

/** The picker's granularity. TIME_OPTIONS and snapToSlot must agree on it. */
const TIME_STEP_MINUTES = 5;
/** Last slot the picker offers, 23:55. */
const LAST_SLOT_MINUTES = 23 * 60 + 55;
/** Only reachable for an event with no start date at all. */
const FALLBACK_START = "09:00";

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < TIME_STEP_MINUTES * 12; m += TIME_STEP_MINUTES) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

/** "HH:mm" → minutes since midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutes since midnight → "HH:mm", clamped inside the day. */
function toHhmm(minutes: number): string {
  const clamped = Math.max(0, Math.min(LAST_SLOT_MINUTES, minutes));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/**
 * Snap to a slot the picker actually offers.
 *
 * The Select only lists 5-minute slots, and a value that is not one of them
 * renders as an EMPTY select — so an event starting at 15:03 would otherwise
 * open the form with no start time at all and an Add button that does nothing
 * obvious. Rounds DOWN so the first agenda item never appears to begin after
 * the event it belongs to.
 */
function snapToSlot(hhmm: string): string {
  const m = toMinutes(hhmm);
  return toHhmm(m - (m % TIME_STEP_MINUTES));
}

/** The local wall-clock time of an ISO instant, as the form writes it. */
function localHhmm(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

/**
 * What a NEW agenda item should start and end at.
 *
 * ── Why not 09:00 ──────────────────────────────────────────────────────────
 *
 * It used to be a hardcoded 09:00-10:00, which is the right answer for almost
 * no event: a 15:00 event opened this form offering a time four hours before
 * it starts, and every item had to be corrected by hand.
 *
 * ── Why the LAST item's end, and not always the event's start ──────────────
 *
 * Agendas are built in sequence. Defaulting the fourth item to the event's
 * start would offer 15:00 on a schedule that already runs to 15:55 — right for
 * the first row and wrong for every one after it. So: continue from where the
 * schedule got to, and fall back to the event's own start when there is
 * nothing to continue from.
 *
 * The one-hour block is kept from the old default, clamped to the end of the
 * day so a late start cannot produce an end the picker refuses to show (it
 * only offers slots strictly after the start).
 */
function defaultTimesFor(
  items: { endTime: string; order: number }[],
  eventStartDate?: string | null,
): { start: string; end: string } {
  const last = items.length > 0
    ? [...items].sort((a, b) => a.order - b.order)[items.length - 1]
    : null;

  const start = last
    ? snapToSlot(localHhmm(last.endTime))
    : eventStartDate
      ? snapToSlot(localHhmm(eventStartDate))
      : FALLBACK_START;

  const end = toHhmm(Math.min(toMinutes(start) + 60, LAST_SLOT_MINUTES));
  return { start, end };
}

interface Props {
  event: any;
  communityTag: string;
  eventId: string;
  showToast: (msg: string) => void;
}

export function AgendaView({ event, communityTag, eventId, showToast }: Props) {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingIdState] = useState<string | "new" | null>(null);
  /*
   * Adding or editing an agenda item is a write on someone else's event.
   *
   * This view was MISSED by the first pass of the read-only work, which gated
   * the modal openers in Overview and Attendees and assumed every editing
   * surface went through one. This one does not -- it edits inline, off its
   * own `editingId` -- so a carrying community's leader could still rewrite a
   * host's schedule. Worth recording: "gate the openers" is only sound if you
   * have actually enumerated them.
   *
   * Closing (null) stays allowed, so nobody is trapped in a half-open form.
   */
  const canEdit = useCanEdit();
  const setEditingId: typeof setEditingIdState = (v) => {
    if (!canEdit && v !== null) return;
    setEditingIdState(v);
  };
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  /*
   * Seeded from the EVENT, not from a fixed 09:00. Items have not loaded on
   * first render, so this is the event-start case; resetForm recomputes with
   * the loaded schedule every time the form is opened.
   */
  const initialTimes = defaultTimesFor([], event?.startDate);
  const [startTime, setStartTime] = useState(initialTimes.start);
  const [endTime, setEndTime] = useState(initialTimes.end);

  const headers = (): Record<string, string> => {
    return getEventManagementConfig().authHeaders();
  };

  useEffect(() => { loadAgenda(); }, [communityTag, eventId]);

  async function loadAgenda() {
    try {
      const res = await fetch(`${apiBase()}/api/communities/${communityTag}/events/${eventId}/agenda`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : data.items || data.agendaItems || []);
      }
    } catch {}
    setAgendaLoading(false);
  }

  function resetForm() {
    /*
     * Recomputed on every open rather than reusing the mount-time value: by
     * the time someone adds a third item the schedule has moved, and the
     * useful default moved with it.
     */
    const next = defaultTimesFor(items, event?.startDate);
    setEditingId(null); setTitle(""); setDescription("");
    setStartTime(next.start); setEndTime(next.end);
  }
  function openAdd() { resetForm(); setEditingId("new"); }
  function openEdit(item: AgendaItem) {
    setTitle(item.title); setDescription(item.description || "");
    setStartTime(new Date(item.startTime).toTimeString().slice(0, 5));
    setEndTime(new Date(item.endTime).toTimeString().slice(0, 5));
    setEditingId(item.id);
  }

  async function handleSave() {
    if (!title.trim() || !event) return;
    setSaving(true);
    const eventDate = new Date(event.startDate);
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startISO = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), sh, sm).toISOString();
    const endISO = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), eh, em).toISOString();
    const body = { title: title.trim(), description: description.trim() || null, startTime: startISO, endTime: endISO };
    try {
      if (editingId === "new") {
        const res = await fetch(`${apiBase()}/api/communities/${communityTag}/events/${eventId}/agenda`, {
          method: "POST", headers: { "Content-Type": "application/json", ...headers() }, body: JSON.stringify(body),
        });
        if (res.ok) {
          // Append the returned row to local state instead of a full
          // refetch. Server assigns id + order; the body otherwise
          // matches what we sent.
          const created = await res.json().catch(() => null);
          if (created?.id) setItems(prev => [...prev, created]);
          else await loadAgenda(); // fallback if response shape surprises us
          showToast("Added"); resetForm();
        } else showToast("Failed to add");
      } else {
        const res = await fetch(`${apiBase()}/api/communities/${communityTag}/events/${eventId}/agenda/${editingId}`, {
          method: "PUT", headers: { "Content-Type": "application/json", ...headers() }, body: JSON.stringify(body),
        });
        if (res.ok) {
          // Replace the row locally with the server response. Avoids
          // the full /agenda refetch the explicit audit flagged.
          const updated = await res.json().catch(() => null);
          if (updated?.id) setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
          else await loadAgenda();
          showToast("Updated"); resetForm();
        } else showToast("Failed to update");
      }
    } catch { showToast("Failed to save"); }
    finally { setSaving(false); }
  }

  async function handleDelete(itemId: string) {
    // Optimistic: yank the row first, rollback on error.
    const prev = items;
    setItems(items.filter(i => i.id !== itemId));
    if (editingId === itemId) resetForm();
    try {
      const res = await fetch(`${apiBase()}/api/communities/${communityTag}/events/${eventId}/agenda/${itemId}`, { method: "DELETE", headers: headers() });
      if (!res.ok) {
        setItems(prev);
        showToast("Failed to remove");
        return;
      }
      showToast("Removed");
    } catch {
      setItems(prev);
      showToast("Failed to remove");
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const newItems = [...items];
    [newItems[index], newItems[target]] = [newItems[target], newItems[index]];
    setItems(newItems);
    try {
      await fetch(`${apiBase()}/api/communities/${communityTag}/events/${eventId}/agenda/reorder`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ itemIds: newItems.map(i => i.id) }),
      });
    } catch { await loadAgenda(); }
  }

  function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); }

  const InlineForm = (
    <div className="px-5 py-4 space-y-3" style={{ background: theme.insetBg }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Item title" autoFocus
        className="w-full px-3 py-2 text-sm border focus:outline-none placeholder:opacity-40"
        style={{ color: theme.text, background: theme.cardBg, borderColor: theme.border, borderRadius: theme.buttonRadius }} />
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" rows={2}
        className="w-full px-3 py-2 text-sm border resize-none focus:outline-none placeholder:opacity-40"
        style={{ color: theme.text, background: theme.cardBg, borderColor: theme.border, borderRadius: theme.buttonRadius }} />
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-[11px] mb-1 block" style={muted(0.5)}>Start</label>
          <Select value={startTime} onValueChange={setStartTime}>
            <SelectTrigger className="w-full px-3 py-2 text-sm border focus:outline-none"
            style={{ color: theme.text, background: theme.cardBg, borderColor: theme.border, borderRadius: theme.buttonRadius }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <label className="text-[11px] mb-1 block" style={muted(0.5)}>End</label>
          <Select value={endTime} onValueChange={setEndTime}>
            <SelectTrigger className="w-full px-3 py-2 text-sm border focus:outline-none"
            style={{ color: theme.text, background: theme.cardBg, borderColor: theme.border, borderRadius: theme.buttonRadius }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.filter(t => t > startTime).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={resetForm} className="px-3 py-1.5 text-[12px] cursor-pointer hover:opacity-70"
          style={{ ...muted(0.6), borderRadius: theme.buttonRadius }}>Cancel</button>
        <button onClick={handleSave} disabled={saving || !title.trim()}
          className="px-3 py-1.5 text-[12px] font-medium disabled:opacity-40 cursor-pointer hover:opacity-90"
          style={{ background: theme.brand, color: theme.onBrand, borderRadius: theme.buttonRadius }}>
          {saving ? "Saving..." : editingId === "new" ? "Add" : "Save"}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>Manage Agenda</h2>
          <p className="text-[12px] mt-0.5" style={muted(0.5)}>Plan the schedule of sessions, breaks, and activities attendees will see.</p>
        </div>
        {editingId !== "new" && (
          <button onClick={openAdd} className="px-4 py-2 text-[13px] font-medium cursor-pointer hover:opacity-90"
            style={{ background: theme.brand, color: theme.onBrand, borderRadius: theme.buttonRadius }}>Add Item</button>
        )}
      </div>

      {/* Card. The redundant "Event Schedule (N items)" sub-header that
          used to live inside this card was dropped — the section header
          above already names this surface; the inner one repeated it. */}
      <div className="shadow-sm overflow-hidden" style={{ background: theme.cardBg, borderRadius: theme.cardRadius, border: `1px solid ${theme.borderSubtle}` }}>
        {editingId === "new" && InlineForm}
        {agendaLoading ? (
          <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse" style={{ background: theme.insetBg, borderRadius: theme.buttonRadius }} />)}</div>
        ) : items.length > 0 ? (
          items.map((item, i) => (
            <div key={item.id}>
              {editingId === item.id ? InlineForm : (
                <div className="flex items-start gap-4 px-5 py-3.5 transition-colors hover:brightness-[0.98]"
                  style={{ borderBottom: (i < items.length - 1 || editingId === "new") ? `1px solid ${theme.borderSubtle}` : "none" }}>
                  <div className="shrink-0 w-[72px] pt-0.5">
                    <p className="text-sm font-medium tabular-nums" style={{ color: theme.text }}>{fmtTime(item.startTime)}</p>
                    <p className="text-[11px] tabular-nums" style={muted(0.5)}>{fmtTime(item.endTime)}</p>
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(item)}>
                    <p className="text-sm font-medium" style={{ color: theme.text }}>{item.title}</p>
                    {item.description && <p className="text-[12px] mt-0.5 line-clamp-2" style={muted(0.6)}>{item.description}</p>}
                  </div>
                  {/* Row actions. Always visible — the hover-reveal pattern
                      was hiding the actions until users guessed they existed.
                      Reorder up/down sit in a paired segmented control;
                      edit + delete sit next to them with explicit color
                      states (delete goes red on hover). */}
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="flex items-center" style={{ background: theme.insetBg, border: `1px solid ${theme.borderSubtle}`, borderRadius: theme.buttonRadius }}>
                      <button onClick={() => handleMove(i, -1)} disabled={i === 0}
                        aria-label="Move up"
                        className="w-7 h-7 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-opacity hover:opacity-100"
                        style={muted(0.6)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
                      </button>
                      <div className="w-px h-4" style={{ background: theme.border }} />
                      <button onClick={() => handleMove(i, 1)} disabled={i === items.length - 1}
                        aria-label="Move down"
                        className="w-7 h-7 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-opacity hover:opacity-100"
                        style={muted(0.6)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                    </div>
                    <button onClick={() => openEdit(item)}
                      aria-label="Edit item"
                      className="w-8 h-8 flex items-center justify-center cursor-pointer transition-opacity hover:opacity-100"
                      style={{ ...muted(0.6), background: theme.insetBg, border: `1px solid ${theme.borderSubtle}`, borderRadius: theme.buttonRadius }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                    <button onClick={() => handleDelete(item.id)}
                      aria-label="Delete item"
                      className="w-8 h-8 flex items-center justify-center text-red-500/70 hover:text-red-500 cursor-pointer transition-colors"
                      style={{ background: theme.insetBg, border: `1px solid ${theme.borderSubtle}`, borderRadius: theme.buttonRadius }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : editingId !== "new" ? (
          <div className="px-5 py-12 text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3" style={muted(0.25)}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <p className="text-sm" style={muted(0.6)}>No agenda items yet</p>
            <p className="text-xs mt-1" style={muted(0.45)}>Add schedule items to help attendees plan their time.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
