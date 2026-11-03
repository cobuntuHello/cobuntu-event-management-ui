"use client";

import { useState, useEffect } from "react";
import { Megaphone, Mail, MessageCircle, X, Send, ChevronLeft, ChevronRight } from "lucide-react";
import { getEventManagementConfig, useEventManagementConfig } from "../../config";
import { EmptyState } from "@cobuntu/management-ui-shared";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import { useCanEdit } from "../../lib/manageAccess";
import { apiBase } from "../helpers";
import { useEventT, getEventT } from "../../create-wizard/i18n";


function authHeaders(): Record<string, string> {
  return getEventManagementConfig().authHeaders();
}
function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeaders() };
}

interface BroadcastRow {
  id: string;
  subject: string;
  body: string;
  sentAt: string;
  sentBy: { name: string; profileImage: string | null };
  recipientCount: number;
}

interface Recipient {
  userId: string | null;
  channel: "EMAIL" | "WHATSAPP";
  status: "PENDING" | "SENT" | "DELIVERED" | "OPENED" | "FAILED";
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  // Populated by BroadcastDeliveryService whenever status is FAILED.
  // Holds the underlying provider error so the admin can debug without
  // tailing Cloud Run logs (e.g. "RESEND_API_KEY not configured",
  // "invalid email address", "WhatsApp: rate limited").
  failedReason: string | null;
  user: { name: string; email: string; profileImage: string | null } | null;
}

interface BroadcastDetail extends BroadcastRow {
  stats: {
    total: number;
    sent: number;
    delivered: number;
    opened: number;
    failed: number;
    byChannel: { email: number; whatsapp: number };
  };
  recipients: Recipient[];
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  const t = getEventT("eventsUi.manageUi.updatesView");
  if (diffH < 1) return t("justNow");
  if (diffH < 24) return t("hoursAgo", { count: diffH });
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return t("daysAgo", { count: diffD });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

interface Props {
  communityTag: string;
  eventId: string;
  showToast: (msg: string) => void;
}

export function UpdatesView({ communityTag, eventId, showToast }: Props) {
  const { UserAvatar: ConfigAvatar } = useEventManagementConfig();
  const UserAvatar = ConfigAvatar ?? UserAvatarFallback;
  const t = useEventT("eventsUi.manageUi.updatesView");
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpenState] = useState(false);
  /*
   * Broadcasting to an event's attendees is a write, and a loud one: it mails
   * a member's buyers in their name. Missed by the first read-only pass for
   * the same reason AgendaView was -- it opens its composer directly rather
   * than through the shared modal state.
   */
  const canEdit = useCanEdit();
  const setComposeOpen: typeof setComposeOpenState = (v) => {
    if (!canEdit && v !== false) return;
    setComposeOpenState(v);
  };
  const [detail, setDetail] = useState<BroadcastDetail | null>(null);

  async function loadBroadcasts() {
    try {
      const res = await fetch(`${apiBase()}/api/communities/${communityTag}/events/${eventId}/broadcasts`, { headers: authHeaders() });
      if (res.ok) setBroadcasts(await res.json()); else setBroadcasts([]);
    } catch { setBroadcasts([]); }
    setLoading(false);
  }

  useEffect(() => { loadBroadcasts(); }, [communityTag, eventId]);

  async function loadDetail(id: string) {
    try {
      const res = await fetch(`${apiBase()}/api/communities/${communityTag}/events/${eventId}/broadcasts/${id}`, { headers: authHeaders() });
      if (res.ok) setDetail(await res.json());
      else showToast(t("failedToLoadDetails"));
    } catch { showToast(t("failedToLoadDetails")); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-900">{t("title")}</h2>
          <p className="text-[12px] text-zinc-400 mt-0.5">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => setComposeOpen(true)}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" /> {t("sendUpdate")}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-zinc-50 animate-pulse" />)}</div>
      ) : broadcasts && broadcasts.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="w-7 h-7" />}
          title={t("emptyTitle")}
          body={t("emptyBody")}
          action={
            <button
              onClick={() => setComposeOpen(true)}
              className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              {t("sendUpdate")}
            </button>
          }
        />
      ) : (
        <div className="space-y-2">
          {broadcasts?.map(b => (
            <button
              key={b.id}
              onClick={() => loadDetail(b.id)}
              className="w-full text-left border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:bg-zinc-50/50 transition cursor-pointer flex items-start gap-4"
            >
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-medium text-zinc-900 truncate">{b.subject}</h3>
                <p className="text-[12.5px] text-zinc-500 mt-1 line-clamp-2">{b.body}</p>
                <div className="flex items-center gap-3 mt-2.5 text-[11.5px] text-zinc-400">
                  <span>{t("recipients", { count: b.recipientCount })}</span>
                  <span>·</span>
                  <span>{b.sentBy?.name}</span>
                  <span>·</span>
                  <span>{formatRelative(b.sentAt)}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-300 mt-1 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {composeOpen && (
        <ComposeUpdate
          communityTag={communityTag}
          eventId={eventId}
          onClose={() => setComposeOpen(false)}
          onSent={() => { setComposeOpen(false); loadBroadcasts(); showToast(t("updateSent")); }}
          showToast={showToast}
        />
      )}

      {detail && <DetailDrawer detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ComposeUpdate({ communityTag, eventId, onClose, onSent, showToast }: {
  communityTag: string; eventId: string; onClose: () => void; onSent: () => void; showToast: (m: string) => void;
}) {
  const t = useEventT("eventsUi.manageUi.updatesView");
  const tc = useEventT("eventsUi.manageUi.overviewCommon");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!subject.trim() || !body.trim()) { showToast(t("required")); return; }
    setSending(true);
    try {
      const res = await fetch(`${apiBase()}/api/communities/${communityTag}/events/${eventId}/broadcasts`, {
        method: "POST", headers: jsonHeaders(),
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || t("failedToSend")); }
      onSent();
    } catch (e: any) { showToast(e.message || t("failedToSend")); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <h2 className="text-[15px] font-semibold text-zinc-900">{t("composeTitle")}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-100 cursor-pointer">
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-[12px] font-medium text-zinc-700 block mb-1.5">{t("subject")}</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={t("subjectPlaceholder")}
              className="w-full px-3 py-2 text-[13px] text-zinc-900 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
              maxLength={150}
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-zinc-700 block mb-1.5">{t("message")}</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={t("messagePlaceholder")}
              rows={7}
              maxLength={2000}
              className="w-full px-3 py-2 text-[13px] text-zinc-900 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 resize-none"
            />
            <p className="text-[11px] text-zinc-400 mt-1">{body.length}/2000</p>
          </div>

          <div className="bg-zinc-50 rounded-lg p-3 flex items-start gap-2.5">
            <div className="flex flex-col gap-1.5 mt-0.5">
              <Mail className="w-3.5 h-3.5 text-zinc-500" />
              <MessageCircle className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div className="flex-1">
              <p className="text-[12px] text-zinc-700">{t("channelsTitle")}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">{t("channelsBody")}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-zinc-100">
          <button onClick={onClose} disabled={sending} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer disabled:opacity-50">{tc("cancel")}</button>
          <button
            onClick={send}
            disabled={sending || !subject.trim() || !body.trim()}
            className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" /> {sending ? t("sending") : t("send")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailDrawer({ detail, onClose }: { detail: BroadcastDetail; onClose: () => void }) {
  // Same injected avatar the outer view uses; the package's own fallback
  // when the host app does not supply one.
  const { UserAvatar: ConfigAvatar } = useEventManagementConfig();
  const UserAvatar = ConfigAvatar ?? UserAvatarFallback;
  const t = useEventT("eventsUi.manageUi.updatesView");
  const { stats } = detail;
  return (
    <div className="fixed inset-0 z-[120] bg-black/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 sticky top-0 bg-white z-10">
          <button onClick={onClose} className="flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-900 cursor-pointer">
            <ChevronLeft className="w-4 h-4" /> {t("back")}
          </button>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-100 cursor-pointer">
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <h2 className="text-[18px] font-semibold text-zinc-900">{detail.subject}</h2>
            <p className="text-[12px] text-zinc-500 mt-1">
              {t("sentBy", { name: detail.sentBy?.name ?? "", when: formatRelative(detail.sentAt) })}
            </p>
          </div>

          <div className="bg-zinc-50 rounded-lg p-4 whitespace-pre-wrap text-[13.5px] text-zinc-700 leading-relaxed">
            {detail.body}
          </div>

          <div className="grid grid-cols-4 gap-3">
            <Stat label={t("statSent")} value={stats.sent} />
            <Stat label={t("statDelivered")} value={stats.delivered} />
            <Stat label={t("statOpened")} value={stats.opened} />
            <Stat label={t("statFailed")} value={stats.failed} accent={stats.failed > 0 ? "text-red-600" : ""} />
          </div>

          <div className="flex items-center gap-4 text-[12px] text-zinc-500">
            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {t("emailCount", { count: stats.byChannel.email })}</span>
            <span className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> {t("whatsappCount", { count: stats.byChannel.whatsapp })}</span>
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-zinc-700 uppercase tracking-wide mb-2">{t("recipientsHeading", { count: detail.recipients.length })}</h3>
            <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-100">
              {detail.recipients.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserAvatar
                      user={{ name: r.user?.name, email: r.user?.email, profileImage: r.user?.profileImage }}
                      className="w-7 h-7 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-zinc-900 truncate">{r.user?.name || t("unknown")}</p>
                      <p className="text-[11px] text-zinc-400 truncate">{r.user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-end gap-2 shrink-0">
                    {r.channel === "EMAIL" ? <Mail className="w-3.5 h-3.5 text-zinc-400" /> : <MessageCircle className="w-3.5 h-3.5 text-zinc-400" />}
                    <div className="flex flex-col items-end gap-0.5">
                      <StatusBadge status={r.status} />
                      {r.status === "FAILED" && r.failedReason && (
                        <p className="text-[10px] text-red-600 max-w-[220px] truncate" title={r.failedReason}>
                          {r.failedReason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "" }: { label: string; value: number; accent?: string }) {
  return (
    <div className="border border-zinc-200 rounded-lg p-3">
      <p className={`text-[18px] font-semibold ${accent || "text-zinc-900"}`}>{value}</p>
      <p className="text-[11px] text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Recipient["status"] }) {
  const t = useEventT("eventsUi.manageUi.updatesView");
  const label =
    status === "PENDING" ? t("statusPending")
      : status === "SENT" ? t("statusSent")
        : status === "DELIVERED" ? t("statusDelivered")
          : status === "OPENED" ? t("statusOpened")
            : status === "FAILED" ? t("statusFailed")
              : status;
  const colors: Record<string, string> = {
    PENDING: "bg-zinc-100 text-zinc-600",
    SENT: "bg-blue-50 text-blue-700",
    DELIVERED: "bg-emerald-50 text-emerald-700",
    OPENED: "bg-emerald-100 text-emerald-700",
    FAILED: "bg-red-50 text-red-700",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[status] || "bg-zinc-100 text-zinc-600"}`}>
      {label}
    </span>
  );
}
