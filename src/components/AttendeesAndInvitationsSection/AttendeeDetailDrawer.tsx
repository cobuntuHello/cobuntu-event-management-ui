"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useEventManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";

type FormField = {
  id: string;
  type: string;
  label?: string;
  options?: { id: string; label: string }[];
};

type Attendee = {
  id: string;
  type?: string;
  name?: string;
  firstName?: string;
  usertag?: string;
  email?: string | null;
  profileImage?: string | null;
  status?: string | null;
  tier?: { id: string; name: string } | null;
  formAnswers?: { fields: FormField[]; answer: Record<string, unknown> } | null;
  createdAt?: string;
};

interface Props {
  attendee: Attendee | null;
  onClose: () => void;
  /**
   * When true, the drawer renders a "Promote to host" action button.
   * The consumer computes the predicate (typically: viewer is event
   * creator + attendee is APPROVED + attendee paid + attendee isn't
   * already a host + event is paid). The drawer itself stays dumb.
   */
  canPromoteToHost?: boolean;
  /**
   * Called when the "Promote to host" action is clicked. The consumer
   * is expected to open its own PromoteAttendeeModal preselected to
   * this attendee. The drawer closes on its own.
   */
  onPromoteToHost?: (attendee: Attendee) => void;
}

export function AttendeeDetailDrawer({ attendee, onClose, canPromoteToHost, onPromoteToHost }: Props) {
  const config = useEventManagementConfig();
  // Pkg-portable avatar rendering: consumer can inject its own via
  // config.UserAvatar; otherwise the minimal initials fallback ships
  // with the pkg.
  const UserAvatar = config.UserAvatar ?? UserAvatarFallback;
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (attendee) {
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    } else {
      setAnimating(false);
      const t = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [attendee?.id]);

  useEffect(() => {
    if (!attendee) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") handleClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attendee?.id]);

  function handleClose() { setAnimating(false); setTimeout(onClose, 300); }

  if (!visible || !attendee) return null;

  const phoneFromForm = pickPhone(attendee.formAnswers);
  const fields = attendee.formAnswers?.fields ?? [];
  const answers = attendee.formAnswers?.answer ?? {};
  const hasAnswers = fields.length > 0 && Object.keys(answers).length > 0;

  const status = (attendee.status || "APPROVED").toUpperCase();
  // PENDING_PAYMENT mapping retained for legacy rows from before the
  // Reserve-Before-Decide cutover (2026-06-14). No new rows are created
  // in this status; once the legacy cron sweeps the queue + a follow-up
  // migration drops the enum value, this branch can be removed.
  const statusStyle =
    status === "REJECTED" ? "bg-red-50 text-red-600 border-red-100"
    : status === "PENDING" ? "bg-amber-50 text-amber-600 border-amber-100"
    : status === "PENDING_PAYMENT" ? "bg-orange-50 text-orange-600 border-orange-100"
    : status === "CANCELLED" ? "bg-zinc-100 text-zinc-500 border-zinc-200"
    : "bg-emerald-50 text-emerald-600 border-emerald-100";
  const statusLabel =
    status === "APPROVED" ? "Confirmed"
    : status === "PENDING_PAYMENT" ? "Payment pending (legacy)"
    : status === "CANCELLED" ? "Cancelled"
    : status.charAt(0) + status.slice(1).toLowerCase();

  return createPortal(
    <>
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-300 ${animating ? "bg-black/50" : "bg-black/0"}`}
        onClick={handleClose}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col rounded-l-2xl overflow-hidden transition-transform duration-300 ease-out ${animating ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 shrink-0">
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Close drawer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
              <polyline points="13 17 18 12 13 7" />
              <polyline points="6 17 11 12 6 7" />
            </svg>
          </button>
          <UserAvatar
            user={{
              name: attendee.name,
              usertag: attendee.usertag,
              email: attendee.email || undefined,
              profileImage: attendee.profileImage || undefined,
              id: attendee.id,
            }}
            className="w-10 h-10"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-zinc-900 truncate">{attendee.name || "Unknown"}</h2>
              {attendee.type === "guest" && (
                <span className="text-[9px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">Guest</span>
              )}
            </div>
            {attendee.usertag && <p className="text-[11px] text-zinc-400 truncate">@{attendee.usertag}</p>}
          </div>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${statusStyle}`}>
            {statusLabel}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Contact + registration meta */}
          <div className="px-5 pt-5">
            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-3">Contact</p>
            <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100">
              <InfoRow label="Email">
                {attendee.email ? (
                  <a href={`mailto:${attendee.email}`} className="text-sm text-blue-600 hover:underline truncate block">
                    {attendee.email}
                  </a>
                ) : (
                  <span className="text-sm text-zinc-400">—</span>
                )}
              </InfoRow>
              {phoneFromForm && (
                <InfoRow label="Phone">
                  <a
                    href={`tel:${phoneFromForm.replace(/[^\d+]/g, "")}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {phoneFromForm}
                  </a>
                </InfoRow>
              )}
              {attendee.tier?.name && (
                <InfoRow label="Tier">
                  <span className="text-sm font-medium text-zinc-900">{attendee.tier.name}</span>
                </InfoRow>
              )}
              {attendee.createdAt && (
                <InfoRow label="Registered">
                  <span className="text-sm text-zinc-700">
                    {new Date(attendee.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                </InfoRow>
              )}
            </div>
          </div>

          {/* Form answers */}
          {hasAnswers && (
            <div className="px-5 pt-6 pb-6">
              <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-3">Form answers</p>
              <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100">
                {fields.map((f) => {
                  const v = answers[f.id];
                  return (
                    <div key={f.id} className="px-4 py-3">
                      <p className="text-[11px] text-zinc-500 mb-1">{f.label || f.id}</p>
                      <FormAnswerValue field={f} value={v} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!hasAnswers && (
            <div className="px-5 pt-6 pb-6">
              <p className="text-[12px] text-zinc-400 text-center py-6">
                {attendee.type === "guest" || attendee.formAnswers === null
                  ? "No form answers — this attendee was added directly or no form was attached to their tier."
                  : "No form answers."}
              </p>
            </div>
          )}
        </div>

        {/* Footer actions. Renders only when the consumer enabled the
            promote-to-host affordance (admin / community-app gate on
            isCreator + paid + APPROVED + not-already-a-host + isPaid). */}
        {canPromoteToHost && onPromoteToHost && (
          <div className="border-t border-zinc-100 px-5 py-4 shrink-0">
            <button
              onClick={() => {
                onPromoteToHost(attendee);
                handleClose();
              }}
              className="w-full px-4 py-2.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M20 21a8 8 0 1 0-16 0"/><path d="m17 8 2 2 4-4"/></svg>
              Promote to host
            </button>
            <p className="text-[11px] text-zinc-400 text-center mt-2">
              They stay registered. Their payment is kept on file.
            </p>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-[11px] text-zinc-500 shrink-0">{label}</span>
      <div className="text-right min-w-0 flex-1">{children}</div>
    </div>
  );
}

function FormAnswerValue({ field, value }: { field: FormField; value: unknown }) {
  if (value == null || value === "") {
    return <p className="text-sm text-zinc-400">—</p>;
  }

  switch (field.type) {
    case "EMAIL": {
      const v = String(value);
      return (
        <a href={`mailto:${v}`} className="text-sm text-blue-600 hover:underline break-all">
          {v}
        </a>
      );
    }
    case "PHONE": {
      const v = String(value);
      const cleaned = v.replace(/[^\d+]/g, "");
      return (
        <a href={`tel:${cleaned}`} className="text-sm text-blue-600 hover:underline">
          {v}
        </a>
      );
    }
    case "URL": {
      const v = String(value);
      return (
        <a href={v} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all">
          {v}
        </a>
      );
    }
    case "DROPDOWN":
    case "RADIO": {
      const opt = (field.options || []).find((o) => o.id === value);
      return <p className="text-sm text-zinc-800">{opt?.label || String(value)}</p>;
    }
    case "CHECKBOXES": {
      if (!Array.isArray(value)) return <p className="text-sm text-zinc-800">{String(value)}</p>;
      const labels = (value as string[]).map(
        (id) => (field.options || []).find((o) => o.id === id)?.label || id,
      );
      return (
        <div className="flex flex-wrap gap-1">
          {labels.map((l, i) => (
            <span key={i} className="text-[11px] font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded">
              {l}
            </span>
          ))}
        </div>
      );
    }
    case "LONG_TEXT": {
      return <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">{String(value)}</p>;
    }
    default:
      return <p className="text-sm text-zinc-800 break-words">{String(value)}</p>;
  }
}

// Pick the first PHONE field's value out of form answers, for the contact card.
function pickPhone(formAnswers: Attendee["formAnswers"]): string | null {
  if (!formAnswers) return null;
  const phoneField = formAnswers.fields.find((f) => f.type === "PHONE");
  if (!phoneField) return null;
  const v = formAnswers.answer[phoneField.id];
  return typeof v === "string" && v.trim() ? v : null;
}
