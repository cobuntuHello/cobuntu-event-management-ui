"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { EventTimestamps } from "../ui/event-timestamps";
import { EventLocationSelector } from "../ui/event-location-selector";
import { EventTags } from "../ui/event-tags";
import { RichTextEditor } from "../ui/rich-text-editor";
import { useEventManagementConfig, useJsonHeaders } from "../config";
import { useStripeStatus, StripeRequiredWarning } from "./stripe-status";
import { DistributionEditModal } from "./DistributionEditModal";
import { htmlToPlainText } from "../lib/htmlToPlainText";

/**
 * Right-side edit-event drawer. The host edits the full set of event
 * fields (name, description, schedule, location, access, tags) and
 * confirms via a three-button "notify attendees?" prompt — same UX
 * as the tier-edit prompt in PriceEditModal.
 *
 * Canonical for both `cobuntu-admin` (community-leader-facing) and
 * `cobuntu-community-app` (host-facing /manage). Reads apiBaseUrl +
 * Authorization from the EventManagementConfigProvider context.
 *
 * Pricing is intentionally NOT here — it lives on the Pricing card
 * via PriceEditModal. The drawer focuses on the non-tier fields.
 */

interface Props {
  event: any;
  communityTag: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}

interface FormState {
  name: string;
  description: string;
  startDate: Date | null;
  endDate: Date | null;
  startTime: string;
  endTime: string;
  timezone: string;
  physicalLocation: string;
  onlineUrl: string;
  // Action gate — who can register / RSVP. Stored on events.accessibility.
  accessibility: string;
  // View gate — who can see the event detail page. Stored on
  // events.viewability. Introduced by the feat/visibility-overrides
  // rollout on the backend (2026-05-20); this package now surfaces it
  // alongside the existing action gate.
  viewability: string;
  tags: { id: string; name: string }[];
}

function eventToForm(event: any): FormState {
  const sd = event.startDate ? new Date(event.startDate) : null;
  const ed = event.endDate ? new Date(event.endDate) : null;
  return {
    name: event.name || "",
    description: event.description || "",
    startDate: sd,
    endDate: ed,
    startTime: sd ? sd.toTimeString().slice(0, 5) : "15:00",
    endTime: ed ? ed.toTimeString().slice(0, 5) : "16:00",
    timezone: event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    physicalLocation: event.physicalLocation || "",
    onlineUrl: event.onlineUrl || "",
    accessibility: event.accessibility || "PUBLIC",
    viewability: event.viewability || "PUBLIC",
    tags: event.tags?.map((t: any) => ({ id: t.id || t.tagId, name: t.name || t.tag?.name })).filter((t: any) => t.id && t.name) || [],
  };
}

type ConfirmState = "hidden" | "options" | "loading" | "success" | "error";
type SubModal = "description" | "location" | "access" | "tags" | null;

export function EditEventDrawer({ event, communityTag, isOpen, onClose, onSaved, showToast }: Props) {
  const { apiBaseUrl } = useEventManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const [form, setForm] = useState<FormState>(() => eventToForm(event));
  const [confirmState, setConfirmState] = useState<ConfirmState>("hidden");
  const [errorMsg, setErrorMsg] = useState("");
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [subModal, setSubModal] = useState<SubModal>(null);
  // Distribution lives in its own standalone modal (DistributionEditModal)
  // — it self-saves via PUT and doesn't share the drawer's confirm flow.
  const [distributionOpen, setDistributionOpen] = useState(false);

  // Temp state for sub-modals
  const [tempDesc, setTempDesc] = useState("");
  const [tempPhysical, setTempPhysical] = useState("");
  const [tempOnline, setTempOnline] = useState("");
  const [tempAccessibility, setTempAccessibility] = useState("PUBLIC");
  const [tempViewability, setTempViewability] = useState("PUBLIC");
  const [tempTags, setTempTags] = useState<{ id: string; name: string }[]>([]);
  const [showStripeWarning, setShowStripeWarning] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _stripe = useStripeStatus(communityTag);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setForm(eventToForm(event));
      setConfirmState("hidden");
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Re-animate when returning from sub-modal
  useEffect(() => {
    if (visible && !subModal) {
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    }
  }, [visible, subModal]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleClose() { setAnimating(false); setTimeout(onClose, 300); }

  // Update flow: close the drawer first (visually), then open the
  // notify-attendees prompt centered on the viewport once the drawer
  // is out of the way. Keeps the drawer mounted underneath so a
  // cancel can re-open it with the user's in-progress edits intact.
  function handleUpdateClick() {
    setAnimating(false);
    setTimeout(() => setConfirmState("options"), 300);
  }

  // Cancel button on the confirmation modal — return the drawer to
  // its open state without unmounting it, so the user keeps their
  // edits. Mirrors `closeSubModal(false)`'s reopen pattern.
  function handleCancelConfirm() {
    setConfirmState("hidden");
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
  }

  function openSubModal(modal: SubModal) {
    if (modal === "description") setTempDesc(form.description);
    if (modal === "location") { setTempPhysical(form.physicalLocation); setTempOnline(form.onlineUrl); }
    if (modal === "access") { setTempAccessibility(form.accessibility); setTempViewability(form.viewability); }
    if (modal === "tags") setTempTags([...form.tags]);
    setAnimating(false);
    setTimeout(() => { setVisible(false); setSubModal(modal); }, 300);
  }

  function closeSubModal(save: boolean) {
    if (save) {
      if (subModal === "description") set("description", tempDesc);
      if (subModal === "location") { set("physicalLocation", tempPhysical); set("onlineUrl", tempOnline); }
      if (subModal === "access") { set("accessibility", tempAccessibility); set("viewability", tempViewability); }
      if (subModal === "tags") set("tags", tempTags);
    }
    setSubModal(null);
    setVisible(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
  }

  async function updateEvent(body: Record<string, unknown>) {
    const res = await fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${event.id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update");
    }
    return res.json();
  }

  async function handleConfirm(notifyAttendees: boolean) {
    setConfirmState("loading");
    try {
      // Validate date+time pairs before serializing. The form's
      // startTime/endTime can be cleared by the user (empty string),
      // which would produce NaN hours/minutes → silent Invalid Date →
      // toISOString throws with an unhelpful "Invalid time value"
      // message. Catch it here with something actionable instead.
      let startISO: string | undefined;
      let endISO: string | undefined;
      if (form.startDate) {
        const [sh, sm] = form.startTime.split(":").map(Number);
        if (!Number.isFinite(sh) || !Number.isFinite(sm)) {
          throw new Error("Start time is invalid. Please re-enter it (HH:MM).");
        }
        const sd = new Date(form.startDate);
        sd.setHours(sh, sm, 0, 0);
        startISO = sd.toISOString();
      }
      if (form.endDate) {
        const [eh, em] = form.endTime.split(":").map(Number);
        if (!Number.isFinite(eh) || !Number.isFinite(em)) {
          throw new Error("End time is invalid. Please re-enter it (HH:MM).");
        }
        const ed = new Date(form.endDate);
        ed.setHours(eh, em, 0, 0);
        endISO = ed.toISOString();
      }
      await updateEvent({
        name: form.name.trim(),
        description: form.description.trim() || null,
        startDate: startISO,
        endDate: endISO,
        timezone: form.timezone,
        physicalLocation: form.physicalLocation.trim() || null,
        onlineUrl: form.onlineUrl.trim() || null,
        accessibility: form.accessibility,
        viewability: form.viewability,
        tagIds: form.tags.map(t => t.id),
        notifyAttendees,
      });
      // Toast fires immediately on backend success. The drawer was
      // already visually closed when the prompt opened; calling
      // onSaved() unmounts it for real and lets the parent reload.
      showToast("Event updated");
      setConfirmState("hidden");
      onSaved();
    } catch (e: any) {
      // Log details so a developer / leader can see the real error in
      // browser devtools — the on-screen message is necessarily short.
      // eslint-disable-next-line no-console
      console.error("[EditEventDrawer] Failed to update event:", e);
      setErrorMsg(e?.message || "Failed to update");
      setConfirmState("error");
      // Do NOT auto-hide on error. User must dismiss explicitly so the
      // error message stays on screen long enough to read + act on.
      // (Pre-fix, errors auto-hid after 2s and people thought the save
      // had silently succeeded when it had actually failed — Truth's
      // 2026-05-15 report.)
    }
  }

  // Strip tags AND decode entities so the preview doesn't show raw
  // "&nbsp;" / "&amp;" from the rich-text editor.
  const descPlain = htmlToPlainText(form.description);

  // ─── Sub-modal: Description ─────────────────────
  if (subModal === "description") {
    if (typeof document === "undefined") return null;
    return createPortal(
      <ModalOverlay onClose={() => closeSubModal(false)}>
        <div className="bg-white rounded-xl shadow-xl w-[calc(100vw-2rem)] md:w-[640px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          <ModalHeader title="Event Description" onClose={() => closeSubModal(false)} />
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <RichTextEditor content={tempDesc} onChange={setTempDesc} placeholder="Describe your event..." />
          </div>
          <ModalFooter onCancel={() => closeSubModal(false)} onSave={() => closeSubModal(true)} />
        </div>
      </ModalOverlay>,
      document.body,
    );
  }

  // ─── Sub-modal: Location ────────────────────────
  if (subModal === "location") {
    if (typeof document === "undefined") return null;
    return createPortal(
      <ModalOverlay onClose={() => closeSubModal(false)}>
        <div className="bg-white rounded-xl shadow-xl w-[calc(100vw-2rem)] md:w-[520px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          <ModalHeader title="Event Location" onClose={() => closeSubModal(false)} />
          <div className="px-6 py-5">
            <p className="text-[13px] text-zinc-500 mb-4">Add a physical location and/or online event link.</p>
            <EventLocationSelector
              physicalLocation={tempPhysical}
              onlineUrl={tempOnline}
              onPhysicalLocationChange={setTempPhysical}
              onOnlineUrlChange={setTempOnline}
              hideHeader
            />
          </div>
          <ModalFooter onCancel={() => closeSubModal(false)} onSave={() => closeSubModal(true)} />
        </div>
      </ModalOverlay>,
      document.body,
    );
  }

  // ─── Sub-modal: Visibility (two axes — view + RSVP) ──────────────
  // Carries both gates from the feat/visibility-overrides rollout:
  //   - viewability: who can see the event detail page at all
  //   - accessibility: who can RSVP / purchase tickets (existing field)
  // Capacity moved to per-tier configuration (Tiers page).
  if (subModal === "access") {
    if (typeof document === "undefined") return null;
    return createPortal(
      <ModalOverlay onClose={() => closeSubModal(false)}>
        <div className="bg-white rounded-xl shadow-xl w-[calc(100vw-2rem)] md:w-[440px] p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
          <ModalHeader title="Visibility" onClose={() => closeSubModal(false)} />
          <div className="px-6 py-5 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800">Visibility: members only</p>
                <p className="text-xs text-zinc-400 mt-0.5">Hide the event listing from non-members entirely</p>
              </div>
              <Toggle checked={tempViewability === "MEMBERS_ONLY"} onChange={v => setTempViewability(v ? "MEMBERS_ONLY" : "PUBLIC")} />
            </div>
            <div className="flex items-center justify-between gap-4 pt-4 border-t border-zinc-100">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800">RSVP: members only</p>
                <p className="text-xs text-zinc-400 mt-0.5">Show the event publicly but restrict registration to members</p>
              </div>
              <Toggle checked={tempAccessibility === "MEMBERS_ONLY"} onChange={v => setTempAccessibility(v ? "MEMBERS_ONLY" : "PUBLIC")} />
            </div>
            <p className="text-[12px] text-zinc-500 leading-relaxed">
              Capacity is configured per ticket tier — visit the Tiers page to set tier capacity.
            </p>
          </div>
          <ModalFooter onCancel={() => closeSubModal(false)} onSave={() => closeSubModal(true)} />
        </div>
      </ModalOverlay>,
      document.body,
    );
  }

  // ─── Sub-modal: Tags ────────────────────────────
  if (subModal === "tags") {
    if (typeof document === "undefined") return null;
    return createPortal(
      <ModalOverlay onClose={() => closeSubModal(false)}>
        <div className="bg-white rounded-xl shadow-xl w-[calc(100vw-2rem)] md:w-[480px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          <ModalHeader title="Event Tags" onClose={() => closeSubModal(false)} />
          <div className="px-6 py-5">
            <p className="text-[13px] text-zinc-500 mb-4">Add tags to help people discover your event.</p>
            <EventTags selectedTags={tempTags} onTagsChange={setTempTags} />
          </div>
          <ModalFooter onCancel={() => closeSubModal(false)} onSave={() => closeSubModal(true)} />
        </div>
      </ModalOverlay>,
      document.body,
    );
  }

  // ─── Drawer ─────────────────────────────────────
  if (!visible && !showStripeWarning) return null;
  if (!visible && showStripeWarning) return <StripeRequiredWarning communityTag={communityTag} onClose={() => setShowStripeWarning(false)} />;

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${animating ? "bg-black/50" : "bg-black/0"}`} onClick={handleClose} />

      <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col rounded-l-2xl overflow-hidden transition-transform duration-300 ease-out ${animating ? "translate-x-0" : "translate-x-full"}`}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 shrink-0">
          <button onClick={handleClose} className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center cursor-pointer shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
          </button>
          <h2 className="text-base font-semibold text-zinc-900">Edit Event</h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Event Name — inline editable */}
          <div className="px-6 py-5 border-b border-zinc-100">
            <input type="text" value={form.name} onChange={e => set("name", e.target.value)} maxLength={100} placeholder="Event name"
              className="w-full text-xl font-bold text-zinc-900 bg-transparent border-none outline-none placeholder:text-zinc-300" />
          </div>

          {/* Description → modal */}
          <ClickableRow icon={<Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8" />} label="Description" onClick={() => openSubModal("description")}>
            {descPlain ? <p className="text-sm text-zinc-600 line-clamp-1">{descPlain}</p> : <p className="text-sm text-zinc-400">Add description...</p>}
          </ClickableRow>

          {/* Schedule — inline in drawer */}
          <div className="px-6 py-5 border-b border-zinc-100">
            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-3">Schedule</p>
            <EventTimestamps
              startDate={form.startDate} endDate={form.endDate} startTime={form.startTime} endTime={form.endTime} timezone={form.timezone}
              onStartDateChange={v => set("startDate", v)} onEndDateChange={v => set("endDate", v)}
              onStartTimeChange={v => set("startTime", v)} onEndTimeChange={v => set("endTime", v)} onTimezoneChange={v => set("timezone", v)}
            />
          </div>

          {/* Location → modal */}
          <ClickableRow icon={<Icon d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />} label="Location" onClick={() => openSubModal("location")}>
            {form.physicalLocation || form.onlineUrl ? (
              <p className="text-sm text-zinc-600 truncate">{form.physicalLocation || form.onlineUrl}</p>
            ) : (
              <p className="text-sm text-zinc-400">Add location...</p>
            )}
          </ClickableRow>

          {/* Pricing was here — now consolidated into the Pricing card on the Overview tab. */}

          {/* Visibility & Access → modal (capacity moved to per-tier).
              The modal exposes the 2-axis visibility model — viewability
              (who can SEE the event) and accessibility (who can RSVP).
              The row's summary text shows the divergence when the two
              gates disagree; otherwise a single value is shown. */}
          <ClickableRow icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} label="Visibility" onClick={() => openSubModal("access")}>
            <p className="text-sm text-zinc-600">
              {form.viewability === form.accessibility
                ? form.viewability === "MEMBERS_ONLY" ? "Members only" : "Public"
                : `View: ${form.viewability === "MEMBERS_ONLY" ? "members only" : "public"} · RSVP: ${form.accessibility === "MEMBERS_ONLY" ? "members only" : "public"}`}
            </p>
          </ClickableRow>

          {/* Tags → modal */}
          <ClickableRow icon={<Icon d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z M7 7h.01" />} label="Tags" onClick={() => openSubModal("tags")}>
            {form.tags.length > 0 ? (
              <p className="text-sm text-zinc-600">{form.tags.map(t => t.name).join(", ")}</p>
            ) : (
              <p className="text-sm text-zinc-400">Add tags...</p>
            )}
          </ClickableRow>

          {/* Distribution → standalone DistributionEditModal (self-saves).
              Surface the same row available from the event overview card so
              admins can flip detailSource / featured without leaving the
              edit flow. The modal handles its own PUT — the drawer's
              Update button is independent. */}
          <ClickableRow
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400"><path d="M4 4h16v6H4z" /><path d="M4 14h16v6H4z" /><circle cx="8" cy="7" r="1" fill="currentColor" /><circle cx="8" cy="17" r="1" fill="currentColor" /></svg>}
            label="Distribution"
            onClick={() => setDistributionOpen(true)}
          >
            <p className="text-sm text-zinc-600">
              {event.detailSource === "EXTERNAL" ? "Custom landing page" : "Cobuntu event page"}
              {event.featured ? " · ⭐ Featured" : ""}
            </p>
          </ClickableRow>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3 shrink-0 bg-white">
          <button onClick={handleClose} className="px-5 py-2.5 text-[13px] font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer">Close</button>
          <button onClick={handleUpdateClick} className="px-5 py-2.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer">Update</button>
        </div>
      </div>

      {/* ─── Update Confirmation ───────────────────── */}
      {confirmState !== "hidden" && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-[calc(100vw-2rem)] md:w-[400px] p-6">
            {confirmState === "options" && (<>
              <h3 className="text-[15px] font-semibold text-zinc-900 mb-4">Update this event?</h3>
              <div className="flex flex-col gap-3">
                <button onClick={() => handleConfirm(true)} className="w-full px-4 py-3 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer">Yes, notify attendees</button>
                <button onClick={() => handleConfirm(false)} className="w-full px-4 py-3 text-[13px] font-medium border border-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-50 cursor-pointer">Yes, do not notify attendees</button>
                <button onClick={handleCancelConfirm} className="w-full px-4 py-3 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-50 cursor-pointer">No, cancel</button>
              </div>
            </>)}
            {confirmState === "loading" && (<div className="py-8 flex flex-col items-center gap-3"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><p className="text-sm text-zinc-500">Updating event...</p></div>)}
            {confirmState === "success" && (<div className="py-8 flex flex-col items-center gap-3"><div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg></div><h3 className="text-[15px] font-semibold text-zinc-900">Event Updated!</h3><p className="text-sm text-zinc-500">Changes saved successfully</p></div>)}
            {confirmState === "error" && (
              <div className="py-6 flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-red-50 flex items-center justify-center">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </div>
                <h3 className="text-[15px] font-semibold text-zinc-900">Update Failed</h3>
                <p className="text-sm text-zinc-500 text-center px-4 break-words">{errorMsg}</p>
                <p className="text-[11px] text-zinc-400 text-center mt-1">Check browser devtools console for full error.</p>
                <button onClick={handleCancelConfirm} className="mt-3 px-5 py-2 text-[13px] font-medium border border-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-50 cursor-pointer">Dismiss</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Distribution modal — opened by the row above. Self-saves; on
          successful save, fires `onSaved` so the drawer's parent refetches
          the event and the drawer's "Distribution" row label updates on
          the next render. */}
      {distributionOpen && (
        <DistributionEditModal
          event={event}
          communityTag={communityTag}
          onClose={() => setDistributionOpen(false)}
          onSaved={() => { setDistributionOpen(false); onSaved(); }}
          showToast={showToast}
        />
      )}
    </>,
    document.body,
  );
}

// ─── Shared sub-components ────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center text-zinc-900" onClick={onClose}>{children}</div>;
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
      <h3 className="text-[15px] font-semibold text-zinc-900">{title}</h3>
      <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center cursor-pointer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

function ModalFooter({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) {
  return (
    <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-2 shrink-0">
      <button onClick={onCancel} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
      <button onClick={onSave} className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer">Save</button>
    </div>
  );
}

function ClickableRow({ icon, label, onClick, children }: { icon: React.ReactNode; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-6 py-4 border-b border-zinc-100 hover:bg-zinc-50 transition-colors cursor-pointer text-left group">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-0.5">{label}</p>
        {children}
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300 shrink-0 group-hover:text-zinc-400"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
      {d.split(" M").map((segment, i) => <path key={i} d={i === 0 ? segment : `M${segment}`} />)}
    </svg>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${checked ? "bg-zinc-900" : "bg-zinc-200"}`}>
      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}
