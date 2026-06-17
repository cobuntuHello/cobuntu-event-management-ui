"use client";

import { useState, useMemo, useEffect } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useEventManagementConfig } from "../config";
import { UserAvatarFallback } from "../ui/user-avatar-fallback";

type Attendee = {
  id: string;
  userId?: string | null;
  name?: string;
  firstName?: string;
  usertag?: string;
  email?: string | null;
  profileImage?: string | null;
  status?: string | null;
  tier?: { id: string; name: string } | null;
};

export interface PromoteAttendeeModalProps {
  eventId: string;
  /**
   * The list of attendees eligible to be promoted. The consumer is
   * responsible for filtering — typical filter is APPROVED + paid +
   * not-already-a-host. The modal renders this list verbatim.
   */
  eligibleAttendees: Attendee[];
  /**
   * When set, skips the picker and jumps directly to a confirm screen
   * for this attendee. Used when the promote action is launched from
   * the per-attendee drawer (the user already chose).
   */
  preselected?: Attendee | null;
  open: boolean;
  onClose: () => void;
  /**
   * Fired after a successful POST. The consumer should refresh its
   * hosts list (and optionally show a toast).
   */
  onPromoted: (attendee: Attendee) => void;
}

/**
 * Promote-attendee-to-host picker modal. Posts to /events/:eventId/hosts
 * with the picked user's id. Backed by HostService.addCoHost which is
 * idempotent on the (eventId, userId) unique constraint (HTTP 409 is
 * surfaced inline; the consumer's refresh will reconcile).
 *
 * Separate from the legacy "Add host" path (which searches all users
 * and bypasses payment). This flow promotes an *attendee* who already
 * paid, so the host displays as host AND the original payment is kept
 * on file — the client's "everyone pays" requirement.
 */
export function PromoteAttendeeModal({
  eventId,
  eligibleAttendees,
  preselected,
  open,
  onClose,
  onPromoted,
}: PromoteAttendeeModalProps) {
  const config = useEventManagementConfig();
  const UserAvatar = config.UserAvatar ?? UserAvatarFallback;
  const [picked, setPicked] = useState<Attendee | null>(null);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPicked(preselected ?? null);
      setQuery("");
      setError(null);
    }
  }, [open, preselected?.id]);

  const filtered = useMemo(() => {
    if (!query.trim()) return eligibleAttendees;
    const q = query.trim().toLowerCase();
    return eligibleAttendees.filter((a) => {
      const hay = `${a.name || ""} ${a.usertag || ""} ${a.email || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, eligibleAttendees]);

  async function confirm() {
    if (!picked) return;
    const userId = picked.userId || picked.id;
    if (!userId) {
      setError("This attendee has no linked user account yet.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiBaseUrl}/events/${eventId}/hosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...config.authHeaders() },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          setError("This person is already a host.");
        } else if (res.status === 403) {
          setError("Only the event creator can promote attendees to host.");
        } else {
          const body = await res.json().catch(() => null);
          setError(body?.message || `Failed (${res.status})`);
        }
        return;
      }
      onPromoted(picked);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <ModalShell onClose={onClose} width="w-full sm:w-[480px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-zinc-900">Promote attendee to host</h3>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-400 cursor-pointer"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {picked ? (
        <div>
          <p className="text-[12px] text-zinc-500 mb-3">
            They will be listed as a host on the event. Their existing registration and payment stay on file.
          </p>
          <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 mb-4">
            <UserAvatar
              user={{
                name: picked.name,
                usertag: picked.usertag,
                email: picked.email || undefined,
                profileImage: picked.profileImage || undefined,
                id: picked.id,
              }}
              className="w-10 h-10"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-zinc-900 truncate">{picked.name || "Unknown"}</p>
              {picked.usertag && <p className="text-[11px] text-zinc-400 truncate">@{picked.usertag}</p>}
            </div>
          </div>
          {error && (
            <p className="text-[12px] text-red-600 mb-3">{error}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            {preselected ? (
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={() => setPicked(null)}
                disabled={submitting}
                className="px-4 py-2 text-[13px] text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer disabled:opacity-50"
              >
                Back
              </button>
            )}
            <button
              onClick={confirm}
              disabled={submitting}
              className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Promoting…" : "Promote to host"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-[12px] text-zinc-500 mb-3">
            Pick a paid attendee to add as a host. Their registration stays in place.
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, handle, or email"
            className="w-full px-3 py-2 text-[13px] border border-zinc-200 rounded-lg mb-3 focus:outline-none focus:border-zinc-400"
          />
          <div className="max-h-[320px] overflow-y-auto -mx-1 rounded-lg border border-zinc-100 divide-y divide-zinc-100">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-zinc-400">
                {eligibleAttendees.length === 0 ? "No paid attendees yet." : "No matches."}
              </p>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setPicked(a)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 text-left cursor-pointer"
                >
                  <UserAvatar
                    user={{
                      name: a.name,
                      usertag: a.usertag,
                      email: a.email || undefined,
                      profileImage: a.profileImage || undefined,
                      id: a.id,
                    }}
                    className="w-8 h-8"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-zinc-900 truncate">{a.name || "Unknown"}</p>
                    {a.usertag ? (
                      <p className="text-[11px] text-zinc-400 truncate">@{a.usertag}</p>
                    ) : a.email ? (
                      <p className="text-[11px] text-zinc-400 truncate">{a.email}</p>
                    ) : null}
                  </div>
                  {a.tier?.name && (
                    <span className="text-[10px] text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded shrink-0">
                      {a.tier.name}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
          {error && (
            <p className="text-[12px] text-red-600 mt-3">{error}</p>
          )}
          <div className="flex justify-end mt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
