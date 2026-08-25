"use client";

import { useState, useEffect } from "react";
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

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 5) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
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
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

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

  function resetForm() { setEditingId(null); setTitle(""); setDescription(""); setStartTime("09:00"); setEndTime("10:00"); }
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
    <div className="px-5 py-4 bg-zinc-50 space-y-3">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Item title" autoFocus
        className="w-full px-3 py-2 text-sm text-zinc-900 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400 placeholder:text-zinc-400" />
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" rows={2}
        className="w-full px-3 py-2 text-sm text-zinc-900 border border-zinc-200 rounded-lg bg-white resize-none focus:outline-none focus:border-zinc-400 placeholder:text-zinc-400" />
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-[11px] text-zinc-400 mb-1 block">Start</label>
          <Select value={startTime} onValueChange={setStartTime}>
            <SelectTrigger className="w-full px-3 py-2 text-sm text-zinc-900 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <label className="text-[11px] text-zinc-400 mb-1 block">End</label>
          <Select value={endTime} onValueChange={setEndTime}>
            <SelectTrigger className="w-full px-3 py-2 text-sm text-zinc-900 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.filter(t => t > startTime).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={resetForm} className="px-3 py-1.5 text-[12px] text-zinc-500 rounded-lg hover:bg-zinc-200 cursor-pointer">Cancel</button>
        <button onClick={handleSave} disabled={saving || !title.trim()}
          className="px-3 py-1.5 text-[12px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-40 cursor-pointer">
          {saving ? "Saving..." : editingId === "new" ? "Add" : "Save"}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-900">Manage Agenda</h2>
          <p className="text-[12px] text-zinc-400 mt-0.5">Plan the schedule of sessions, breaks, and activities attendees will see.</p>
        </div>
        {editingId !== "new" && (
          <button onClick={openAdd} className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer">Add Item</button>
        )}
      </div>

      {/* Card. The redundant "Event Schedule (N items)" sub-header that
          used to live inside this card was dropped — the section header
          above already names this surface; the inner one repeated it. */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
        {editingId === "new" && InlineForm}
        {agendaLoading ? (
          <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-zinc-50 animate-pulse" />)}</div>
        ) : items.length > 0 ? (
          items.map((item, i) => (
            <div key={item.id}>
              {editingId === item.id ? InlineForm : (
                <div className={`flex items-start gap-4 px-5 py-3.5 hover:bg-zinc-50 transition-colors ${i < items.length - 1 || editingId === "new" ? "border-b border-zinc-100" : ""}`}>
                  <div className="shrink-0 w-[72px] pt-0.5">
                    <p className="text-sm font-medium text-zinc-900 tabular-nums">{fmtTime(item.startTime)}</p>
                    <p className="text-[11px] text-zinc-400 tabular-nums">{fmtTime(item.endTime)}</p>
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(item)}>
                    <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                    {item.description && <p className="text-[12px] text-zinc-500 mt-0.5 line-clamp-2">{item.description}</p>}
                  </div>
                  {/* Row actions. Always visible — the hover-reveal pattern
                      was hiding the actions until users guessed they existed.
                      Reorder up/down sit in a paired segmented control;
                      edit + delete sit next to them with explicit color
                      states (delete goes red on hover). */}
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="flex items-center rounded-lg bg-zinc-50 ring-1 ring-zinc-100">
                      <button onClick={() => handleMove(i, -1)} disabled={i === 0}
                        aria-label="Move up"
                        className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer rounded-l-lg transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
                      </button>
                      <div className="w-px h-4 bg-zinc-200" />
                      <button onClick={() => handleMove(i, 1)} disabled={i === items.length - 1}
                        aria-label="Move down"
                        className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer rounded-r-lg transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                    </div>
                    <button onClick={() => openEdit(item)}
                      aria-label="Edit item"
                      className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 ring-1 ring-zinc-100 rounded-lg cursor-pointer transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                    <button onClick={() => handleDelete(item.id)}
                      aria-label="Delete item"
                      className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-red-500 bg-zinc-50 hover:bg-red-50 ring-1 ring-zinc-100 hover:ring-red-100 rounded-lg cursor-pointer transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : editingId !== "new" ? (
          <div className="px-5 py-12 text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-zinc-200 mb-3"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <p className="text-sm text-zinc-500">No agenda items yet</p>
            <p className="text-xs text-zinc-400 mt-1">Add schedule items to help attendees plan their time.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
