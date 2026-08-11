"use client";

interface Card {
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
}

interface Props {
  isPublished: boolean;
  isEventPast: boolean;
  isEventLive: boolean;
  /**
   * When true, Delete Event locks regardless of lifecycle. Orphaning
   * financial state (sales / payouts / invoices / disputes) by hard-
   * deleting an event with paid registrations is unsafe; the host
   * has to cancel + refund first, then delete.
   */
  hasPaidAttendees: boolean;
  /**
   * Whether this event can have community-scoped settings at all.
   *
   * FALSE ⇒ the Settings card is NOT RENDERED, not disabled. Everything behind
   * it — visibility, access, distribution, after-checkout — is a statement
   * about a COMMUNITY: who among its members may see or RSVP, where its
   * storefront sends people. A user-owned event has no membership to gate
   * against, and the backend now refuses all of them with a 403 (see
   * communityScopedSettings on the server).
   *
   * A disabled card would advertise a capability this event cannot have and
   * invite "how do I unlock it?", a question with no answer. Defaults true so
   * a consumer that has not been updated keeps today's behaviour.
   */
  canConfigureSettings?: boolean;
  onShare: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  /** Whether this event already has a linked group chat. */
  groupChatExists: boolean;
  /**
   * Group-chat card action. Parent decides the behavior by lifecycle:
   * no chat yet → open the create-group-chat modal; chat already exists
   * (card label "Group chat active") → open the chat in the community-app.
   */
  onGroupChat: () => void;
}

/**
 * 3-up quick action cards rendered on the event overview tab only.
 *
 * Mirrors Luma's "primary actions" tile pattern. Lifecycle actions
 * (Share / Edit / Publish-Unpublish / Delete) live here instead of a
 * compact toolbar; the page header just has Preview.
 */
export function OverviewActionCards({
  isPublished, isEventPast, isEventLive, hasPaidAttendees,
  canConfigureSettings = true,
  onShare, onEdit, onDuplicate, onPublish, onUnpublish, onDelete,
  groupChatExists, onGroupChat,
}: Props) {
  const publishDisabled = isEventPast || (isPublished && isEventLive);
  const deleteDisabled = isEventLive || hasPaidAttendees;

  const cards: Card[] = [
    {
      label: "Share Event",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-500",
      disabled: !isPublished,
      onClick: onShare,
    },
    ...(canConfigureSettings ? [{
      // feat/manage-event-restructure: was "Edit Event" (opened the legacy
      // EditEventDrawer). Now opens the SettingsDrawer — visibility,
      // access, distribution, membership funnel. The `onEdit` callback
      // prop name is preserved to keep this component-internal; parent
      // wires it to setSettingsDrawerOpen.
      label: "Settings",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
      iconBg: "bg-zinc-100",
      iconColor: "text-zinc-700",
      // Open always. The drawer surfaces a past-event note for the
      // settings that no longer change anything for buyers (Access,
      // Featured, Membership funnel) — Visibility + custom landing
      // URL stay legitimately editable post-event.
      onClick: onEdit,
    }] : []),
    {
      label: "Duplicate Event",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
      iconBg: "bg-violet-50",
      iconColor: "text-violet-500",
      onClick: onDuplicate,
    },
    {
      label: groupChatExists ? "Group chat active" : "Create group chat",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
      iconBg: groupChatExists ? "bg-emerald-50" : "bg-sky-50",
      iconColor: groupChatExists ? "text-emerald-500" : "text-sky-500",
      onClick: onGroupChat,
    },
    {
      label: isPublished ? "Unpublish" : "Publish",
      icon: isPublished
        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
      iconBg: "bg-zinc-100",
      iconColor: "text-zinc-700",
      disabled: publishDisabled,
      onClick: isPublished ? onUnpublish : onPublish,
    },
    {
      label: "Delete Event",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
      iconBg: "bg-red-50",
      iconColor: "text-red-500",
      // Disabled mid-event (don't yank a live event) and when there
      // are paid attendees (hard-deleting orphans sales/payouts/
      // invoices/disputes — host must cancel + refund first, then
      // delete the now-empty event).
      disabled: deleteDisabled,
      destructive: true,
      onClick: onDelete,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      {cards.map((c) => (
        <button
          key={c.label}
          onClick={c.disabled ? undefined : c.onClick}
          disabled={c.disabled}
          className={`flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl bg-zinc-50 text-left transition-colors ${
            c.disabled
              ? "opacity-40 cursor-not-allowed"
              : c.destructive
                ? "hover:bg-red-50/60 cursor-pointer"
                : "hover:bg-zinc-100 cursor-pointer"
          }`}>
          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${c.iconBg} ${c.iconColor}`}>
            {c.icon}
          </div>
          <span className={`text-[13px] sm:text-[14px] font-medium min-w-0 truncate ${c.destructive ? "text-red-600" : "text-zinc-900"}`}>
            {c.label}
          </span>
        </button>
      ))}
    </div>
  );
}
