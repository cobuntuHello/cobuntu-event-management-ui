"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  PriceEditModal,
  NameEditModal,
  DateTimeEditModal,
  LocationEditModal,
  SlugEditModal,
  ShareModal,
  PublishModal,
  DeleteModal,
  DuplicateModal,
  SettingsDrawer,
  DescriptionEditModal,
  TagsEditModal,
  EventRevenueKPIs,
  CreateGroupChatModal,
  EventChatCapacityNotice,
} from "@cobuntu/event-management-ui";
import { getEventStatus, updateEvent, API, authHeaders } from "../helpers";
import { BannerCropModal, type BannerCropResult } from "../../ui/banner-crop-modal";
import { useEventManagementConfig } from "../../config";

// Sections
import { EventCard } from "../sections/EventCard";
import { OverviewActionCards } from "../sections/OverviewActionCards";
import { DonationsSummaryCard } from "../../components/DonationsSummaryCard";
// feat/manage-event-restructure / attendees-unified: the
// AttendeesAndInvitationsSection moved to the new Attendees tab.
// Only its paid-event revenue KPIs stay on Overview, via the standalone
// EventRevenueKPIs component (imported above from @cobuntu/event-management-ui).

// All event-management modals now live in @cobuntu/event-management-ui

// feat/manage-event-restructure: "distribution" removed from EventModal —
// it now lives inside the SettingsDrawer (along with viewability, accessibility,
// and the refund policy), invoked by the Settings quick action card.
export type EventModal = "name" | "datetime" | "location" | "price" | "slug" | "description" | "tags" | "share" | "publish" | "unpublish" | "delete" | "duplicate" | "groupChat" | null;

interface GroupChatState {
  conversationId: string | null;
  announceOnly: boolean;
  memberCount: number;
  maxMembers: number;
}

interface Props {
  event: any;
  communityTag: string;
  eventId: string;
  isPublished: boolean;
  communityColor?: string | null;
  onUpdate: () => void;
  onDelete: () => void;
  showToast: (msg: string) => void;
}

export function OverviewView({ event, communityTag, eventId, isPublished, onUpdate, onDelete, showToast }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<EventModal>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bannerCropOpen, setBannerCropOpen] = useState(false);

  // Event group chat (event<->chat linking). Null until the state is fetched;
  // conversationId null = no chat yet → the action card offers "Create".
  const [groupChat, setGroupChat] = useState<GroupChatState | null>(null);
  const loadGroupChat = useCallback(() => {
    fetch(`${API}/api/communities/${communityTag}/events/${event.id}/group-chat`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setGroupChat(d); })
      .catch(() => {});
  }, [communityTag, event.id]);
  useEffect(() => { loadGroupChat(); }, [loadGroupChat]);

  // (Community fetch removed alongside the funnel-feature kill —
  // the only consumer was MembershipFunnelSection's prerequisite
  // check. The feature will be rebuilt as pure-FE later under
  // Workstream 1 of the events-domain roadmap.)

  const status = getEventStatus(event);

  // The group chat lives in the community-app (a different host than admin),
  // at /conversations/<conversationId>. getCommunityAppUrl resolves that host
  // (env override → admin-subdomain strip → {tag}.cobuntu.com), matching how
  // the marketplace/event listing "Open chat" actions deep-link into it.
  const { communityAppUrl } = useEventManagementConfig();
  const openGroupChat = useCallback(() => {
    const conversationId = groupChat?.conversationId;
    if (!conversationId) return;
    window.open(
      `${(communityAppUrl ? communityAppUrl(communityTag) : `https://${communityTag}.cobuntu.com`)}/conversations/${conversationId}`,
      "_blank",
      "noopener",
    );
  }, [groupChat?.conversationId, communityTag]);

  function close() { setModal(null); }
  function saved() { setModal(null); onUpdate(); }

  async function handleBannerSave(result: BannerCropResult) {
    try {
      await updateEvent(communityTag, event.id, { bannerUrl: result.base64 || null });
      showToast(result.base64 ? "Image updated" : "Image removed");
      onUpdate();
    } catch (e: any) { showToast(e.message || "Failed to update image"); }
  }

  return (
    <div className="space-y-6">
      <OverviewActionCards
        /*
         * Always. This used to be `!!event?.communityId`, which hid the whole
         * button on a personal event — and with it Approval and the refund
         * policy, two settings the OWNER of that event is entitled to set
         * (the backend keeps both out of COMMUNITY_SCOPED_EVENT_FIELDS). The
         * drawer scopes its own rows now, so the community-only ones stay
         * out on a personal event without taking the entry point with them.
         */
        canConfigureSettings
        isPublished={isPublished}
        isEventPast={!!status.isPast}
        isEventLive={!!status.isLive}
        // Conservative signal: paid event + at least one attendee.
        // Catches the orphan-financials hazard even if every attendee
        // is a comp (Delete still goes through the cancel-+-refund
        // flow first, then the now-empty event can be removed).
        hasPaidAttendees={!!status.isPaid && status.attendeeCount > 0}
        onShare={() => setModal("share")}
        onEdit={() => setDrawerOpen(true)}
        onDuplicate={() => setModal("duplicate")}
        onPublish={() => setModal("publish")}
        onUnpublish={() => setModal("unpublish")}
        onDelete={() => setModal("delete")}
        groupChatExists={!!groupChat?.conversationId}
        // When a chat already exists the card label is "Group chat active" —
        // jump into the chat (community-app) instead of re-opening the
        // create modal. No chat yet → open the create flow unchanged.
        onGroupChat={() => (groupChat?.conversationId ? openGroupChat() : setModal("groupChat"))}
      />

      {groupChat?.conversationId && (
        <EventChatCapacityNotice
          memberCount={groupChat.memberCount}
          maxMembers={groupChat.maxMembers}
          announceOnly={groupChat.announceOnly}
          // Without onOpenChat the soft-threshold nudge degrades to
          // text-only; wire it to the same deep-link so the notice keeps
          // its one-click "Open chat" action.
          onOpenChat={openGroupChat}
        />
      )}

      <EventCard
        event={event}
        communityTag={communityTag}
        isPublished={isPublished}
        isPast={!!status.isPast}
        isLive={!!status.isLive}
        isPaid={status.isPaid}
        attendeeCount={status.attendeeCount}
        missingRequirements={status.missingRequirements}
        onEditName={() => setModal("name")}
        onEditDateTime={() => setModal("datetime")}
        onEditLocation={() => setModal("location")}
        onEditPrice={() => setModal("price")}
        onEditSlug={() => setModal("slug")}
        onEditBanner={() => setBannerCropOpen(true)}
        onEditDescription={() => setModal("description")}
        onEditTags={() => setModal("tags")}
      />

      <DonationsSummaryCard communityTag={communityTag} eventId={eventId} />

      {/* AttendeesAndInvitationsSection moved to the Attendees tab
          (attendees-unified). Only the paid-event revenue KPIs stay
          on Overview. EventListingsSection moved to its own Listings
          tab — was inline here previously but competed for screen
          real estate with Settings + per-field quick edits. */}
      <EventRevenueKPIs event={event} communityTag={communityTag} />

      {/* (MembershipFunnelSection removed alongside the BE module kill —
          the funnel feature will be rebuilt as pure-FE later under
          Workstream 1 of the events-domain roadmap.) */}

      {modal === "name" && <NameEditModal event={event} communityTag={communityTag} onClose={close} onSaved={saved} showToast={showToast} />}
      {modal === "datetime" && <DateTimeEditModal event={event} communityTag={communityTag} onClose={close} onSaved={saved} showToast={showToast} />}
      {modal === "location" && <LocationEditModal event={event} communityTag={communityTag} onClose={close} onSaved={saved} showToast={showToast} />}
      {modal === "description" && <DescriptionEditModal event={event} communityTag={communityTag} onClose={close} onSaved={saved} showToast={showToast} />}
      {modal === "tags" && <TagsEditModal event={event} communityTag={communityTag} onClose={close} onSaved={saved} showToast={showToast} />}
      {modal === "price" && (
        <PriceEditModal
          event={event}
          communityTag={communityTag}
          onClose={close}
          onSaved={saved}
          showToast={showToast}
          // The form builder is inlined into the modal's EditHub
          // Form step now — no external navigation needed. The
          // legacy onOpenTierForm prop is gone from the package
          // surface (Phase C of the redesign rollout).
          //
          // Admin only edits community-owned events — enable the
          // per-segment member-pricing override editor on each tier
          // card. The shared pkg hides the section per-tier for
          // unsaved drafts (no tier id yet).
          showMemberPricing
        />
      )}
      {modal === "slug" && (
        <SlugEditModal
          event={event}
          communityTag={communityTag}
          onClose={close}
          onSaved={saved}
          showToast={showToast}
          onSlugChanged={(newSlug) => router.replace(`/${communityTag}/events/${newSlug}`)}
        />
      )}
      {/* "distribution" modal is rendered by SettingsDrawer when its
          Distribution row is clicked. No separate top-level mount needed. */}
      {modal === "share" && <ShareModal event={event} communityTag={communityTag} onClose={close} />}
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

      <BannerCropModal
        open={bannerCropOpen}
        onOpenChange={setBannerCropOpen}
        initialImageSrc={event.bannerUrl}
        onSave={handleBannerSave}
        title="Event Image"
      />

      {/*
        Rendered only when the event can have these settings — the action that
        opens it is gated identically, so this guards a stale open state.
      */}
      {!!event?.communityId && <SettingsDrawer
        event={event}
        communityTag={communityTag}
        isOpen={drawerOpen}
        isPast={!!status.isPast}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => { onUpdate(); }}
        showToast={showToast}
      />}
      {/* The drawer used to be gated on a community fetch (community
          prop was required for MembershipFunnelEditModal). With the
          funnel kill, `community` is no longer needed, the gate is
          gone, and the drawer renders unconditionally — fixes a
          latent bug where a transient /communities or /segments fetch
          failure would silently hide every other settings row. */}
    </div>
  );
}
