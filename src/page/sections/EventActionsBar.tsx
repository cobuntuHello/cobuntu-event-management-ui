"use client";

/**
 * The event's quick actions: share, settings, duplicate, group chat, private
 * hire, add-ons, publish, delete. They sit ABOVE the tabs so they are one tap
 * away on every tab, not only Details.
 *
 * This owns everything those actions open (their modals and the settings
 * drawer), so DetailsView keeps only the edit rows' own modals. Read-only
 * viewers still share and duplicate: neither changes THIS event, and
 * duplicating last edition is the main thing a host does with an ended one.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShareModal,
  PrivateHireModal,
  EventAddonsModal,
  PublishModal,
  DeleteModal,
  DuplicateModal,
  SettingsDrawer,
  CreateGroupChatModal,
  EventChatCapacityNotice,
} from "@cobuntu/event-management-ui";
import { getEventStatus, apiBase, authHeaders } from "../helpers";
import { useEventManagementConfig } from "../../config";
import { useCanEdit } from "../../lib/manageAccess";
import { OverviewActionCards } from "./OverviewActionCards";

/** The window event a host's Overview dispatches to ask this bar to do something. */
export const MANAGE_ACTION_EVENT = "cobuntu:manage-action";

type ActionModal = "share" | "publish" | "unpublish" | "delete" | "duplicate" | "groupChat" | "privateHire" | "eventAddons" | null;

interface GroupChatState {
  conversationId: string | null;
  announceOnly: boolean;
  memberCount: number;
  maxMembers: number;
}

/**
 * Has anyone actually PAID? Delete locks on this, because hard-deleting an
 * event with sales orphans payouts, invoices and disputes (the host cancels and
 * refunds first).
 *
 * The backend's real count wins. The old rule was "priced event AND any
 * attendee", a guess that locked an event with seven free invitees and no sales
 * at all. When the count is not there (an older backend) the guess stays, so a
 * paid event is never left deletable by mistake.
 */
export function hasPaidSales(event: any, status: { isPaid: boolean; attendeeCount: number }): boolean {
  const sales = event?._count?.sales;
  if (typeof sales === "number") return sales > 0;
  return !!status.isPaid && status.attendeeCount > 0;
}

interface Props {
  event: any;
  communityTag: string;
  isPublished: boolean;
  onUpdate: () => void;
  onDelete: () => void;
  showToast: (msg: string) => void;
}

export function EventActionsBar({ event, communityTag, isPublished, onUpdate, onDelete, showToast }: Props) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const [modal, setModalState] = useState<ActionModal>(null);
  const [drawerOpen, setDrawerOpenState] = useState(false);

  const setModal = (v: ActionModal) => {
    if (!canEdit && v !== null && v !== "share" && v !== "duplicate") return;
    setModalState(v);
  };
  const setDrawerOpen = (v: boolean) => {
    if (!canEdit && v) return;
    setDrawerOpenState(v);
  };

  // Event group chat. Null until fetched; conversationId null = no chat yet,
  // so the card offers "Create".
  const [groupChat, setGroupChat] = useState<GroupChatState | null>(null);
  const loadGroupChat = useCallback(() => {
    fetch(`${apiBase()}/api/communities/${communityTag}/events/${event.id}/group-chat`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setGroupChat(d); })
      .catch(() => {});
  }, [communityTag, event.id]);
  useEffect(() => { loadGroupChat(); }, [loadGroupChat]);

  const status = getEventStatus(event, communityTag);

  /*
   * The Overview tab can ask for Publish (its next-step card, for an event that
   * was never published). It is rendered by the HOST app through a slot, so it
   * cannot reach this bar's state; a window event is the seam. There is still
   * one dialog and one place that owns it, and a request while the event is
   * already on a shelf is ignored rather than opening an Unpublish by accident.
   */
  useEffect(() => {
    const onAsk = (e: Event) => {
      if ((e as CustomEvent).detail?.action === "publish" && !isPublished) setModal("publish");
    };
    window.addEventListener(MANAGE_ACTION_EVENT, onAsk);
    return () => window.removeEventListener(MANAGE_ACTION_EVENT, onAsk);
    // setModal closes over canEdit; re-subscribe when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublished, canEdit]);

  // The chat lives in the community app, at /conversations/<id>.
  const { communityAppUrl } = useEventManagementConfig();
  const openGroupChat = useCallback(() => {
    const conversationId = groupChat?.conversationId;
    if (!conversationId) return;
    window.open(
      `${(communityAppUrl ? communityAppUrl(communityTag) : `https://${communityTag}.cobuntu.com`)}/conversations/${conversationId}`,
      "_blank",
      "noopener",
    );
  }, [groupChat?.conversationId, communityTag, communityAppUrl]);

  function close() { setModal(null); }
  function saved() { setModal(null); onUpdate(); }

  return (
    <div className="space-y-4 mb-6">
      <OverviewActionCards
        canConfigureSettings
        readOnly={!canEdit}
        isPublished={isPublished}
        isEventPast={!!status.isPast}
        isEventLive={!!status.isLive}
        hasPaidAttendees={hasPaidSales(event, status)}
        onShare={() => setModal("share")}
        onEdit={() => setDrawerOpen(true)}
        onDuplicate={() => setModal("duplicate")}
        onPublish={() => setModal("publish")}
        onUnpublish={() => setModal("unpublish")}
        onDelete={() => setModal("delete")}
        groupChatExists={!!groupChat?.conversationId}
        onGroupChat={() => (groupChat?.conversationId ? openGroupChat() : setModal("groupChat"))}
        onPrivateHire={() => setModal("privateHire")}
        onEventAddons={() => setModal("eventAddons")}
      />

      {groupChat?.conversationId && (
        <EventChatCapacityNotice
          memberCount={groupChat.memberCount}
          maxMembers={groupChat.maxMembers}
          announceOnly={groupChat.announceOnly}
          onOpenChat={openGroupChat}
        />
      )}

      {modal === "share" && <ShareModal event={event} communityTag={communityTag} onClose={close} />}
      {modal === "privateHire" && <PrivateHireModal event={event} communityTag={communityTag} onClose={close} />}
      {modal === "eventAddons" && <EventAddonsModal event={event} communityTag={communityTag} onClose={close} />}
      {modal === "groupChat" && (
        <CreateGroupChatModal
          event={event}
          communityTag={communityTag}
          attendeeCount={status.attendeeCount}
          onClose={close}
          showToast={showToast}
          onCreated={() => { close(); loadGroupChat(); }}
        />
      )}
      {(modal === "publish" || modal === "unpublish") && (
        <PublishModal event={event} communityTag={communityTag} isPublished={isPublished}
          isPaid={status.isPaid} attendeeCount={status.attendeeCount} missingRequirements={status.missingRequirements}
          onClose={close} onDone={saved} showToast={showToast} />
      )}
      {modal === "delete" && <DeleteModal event={event} isPaid={status.isPaid} attendeeCount={status.attendeeCount} onClose={close} onConfirm={() => { close(); onDelete(); }} />}
      {modal === "duplicate" && (
        <DuplicateModal
          event={event}
          communityTag={communityTag}
          onClose={close}
          showToast={showToast}
          onDuplicated={(newEvent) => {
            const target = newEvent.id || newEvent.slug;
            if (target) router.push(`/${communityTag}/events/${target}`);
          }}
        />
      )}

      {/* Mounted for EVERY event, community-owned or not: the drawer scopes
          its own rows, so the entry point need not know which settings exist. */}
      <SettingsDrawer
        event={event}
        communityTag={communityTag}
        isOpen={drawerOpen}
        isPast={!!status.isPast}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => { onUpdate(); }}
        showToast={showToast}
      />
    </div>
  );
}
