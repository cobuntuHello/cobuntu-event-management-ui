/**
 * The DETAILS tab: everything about this event you can change.
 *
 * This was the Overview tab, which is why opening an event used to greet you
 * with a form. Same rows, same modals, renamed and moved second. Overview is a
 * dashboard now.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PriceEditModal,
  NameEditModal,
  DateTimeEditModal,
  LocationEditModal,
  SlugEditModal,
  TagsEditModal,
  EventRevenueKPIs,
} from "@cobuntu/event-management-ui";
import { getEventStatus } from "../helpers";
import { EventImagesDialog } from "../../components/EventImagesDialog";

// Sections
import { EventCard } from "../sections/EventCard";
import { DescriptionSection } from "../sections/DescriptionSection";
import { DonationsSummaryCard } from "../../components/DonationsSummaryCard";
import { useCanEdit } from "../../lib/manageAccess";
import { useEventT } from "../../create-wizard/i18n";
// feat/manage-event-restructure / attendees-unified: the
// AttendeesAndInvitationsSection moved to the new Attendees tab.
// Only its paid-event revenue KPIs stay on Overview, via the standalone
// EventRevenueKPIs component (imported above from @cobuntu/event-management-ui).

// All event-management modals now live in @cobuntu/event-management-ui

// feat/manage-event-restructure: "distribution" removed from EventModal —
// it now lives inside the SettingsDrawer (along with viewability, accessibility,
// and the refund policy), invoked by the Settings quick action card.
export type EventModal = "name" | "datetime" | "location" | "price" | "slug" | "tags" | null;

interface Props {
  event: any;
  communityTag: string;
  eventId: string;
  isPublished: boolean;
  communityColor?: string | null;
  onUpdate: () => void;
  onDelete: () => void;
  showToast: (msg: string) => void;
  /**
   * True when this is the host's OWN event (no owning community) with an
   * open submission (pending, live or paused) in `communityTag`. The host
   * app knows the listing status; the event payload here does not carry it.
   * Turns on the seller's member pricing (memberPricingScope "seller").
   * See docs/features/user-owned-member-pricing.md in the backend repo.
   */
  sellerMemberPricing?: boolean;
}

export function DetailsView({ event, communityTag, eventId, isPublished, onUpdate, onDelete, showToast, sellerMemberPricing }: Props) {
  const router = useRouter();
  const [modal, setModalState] = useState<EventModal>(null);
  const [bannerCropOpen, setBannerCropOpenState] = useState(false);

  /*
   * Every editing surface on this view opens through one of these three
   * setters, so gating them here gates all of them.
   *
   * Deliberately at the OPENER and not at each button: a modal that cannot be
   * opened cannot save, so a control that slips through and still renders
   * leads nowhere instead of leading to a 403. Guarding forty-odd buttons
   * individually is how one gets missed, and a missed one is not cosmetic --
   * it is a control that looks live and is not.
   *
   * Closing is always allowed. Read-only is about writing, and trapping
   * somebody in a dialog they can no longer dismiss would be a worse bug than
   * the one this fixes.
   */
  const canEdit = useCanEdit();
  const setModal: typeof setModalState = (v) => {
    // Every modal here edits a field, so all stay shut when read-only (T-370).
    // Share and duplicate moved to the actions bar above the tabs.
    if (!canEdit && v !== null) return;
    setModalState(v);
  };
  const setBannerCropOpen: typeof setBannerCropOpenState = (v) => {
    if (!canEdit && v !== false) return;
    setBannerCropOpenState(v);
  };

  // (Community fetch removed alongside the funnel-feature kill —
  // the only consumer was MembershipFunnelSection's prerequisite
  // check. The feature will be rebuilt as pure-FE later under
  // Workstream 1 of the events-domain roadmap.)

  const status = getEventStatus(event, communityTag);
  const t = useEventT("eventsUi.manageUi.detailsView");

  function close() { setModal(null); }
  function saved() { setModal(null); onUpdate(); }

  return (
    <div className="space-y-6">
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
        onEditTags={() => setModal("tags")}
        readOnly={!canEdit}
      />

      {/*
        * Description, in full, directly below the card.
        *
        * It was a truncated row that opened a modal. The other fields are a
        * date, a price, a slug — things a compact row shows completely — but a
        * description is paragraphs, so that row displayed almost nothing and
        * amounted to a permanent instruction to click. Reading the page and
        * reading the description were two separate acts.
        */}
      <DescriptionSection
        event={event}
        communityTag={communityTag}
        onSaved={saved}
        showToast={showToast}
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
          // Member pricing: a community-owned event (the leaders' prices),
          // or the host's own event with an open submission in this
          // community (sellerMemberPricing; their discount for its
          // members). Shared view, so the gate is ownership-aware. The
          // section still hides per tier for unsaved drafts (no tier id).
          showMemberPricing={!!event?.communityId || !!sellerMemberPricing}
          memberPricingScope={event?.communityId ? "community" : "seller"}
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
      {/* The event's photos: cover first, then the square gallery, under the
          community's image rules (docs/features/event-gallery.md). */}
      <EventImagesDialog
        open={bannerCropOpen}
        onOpenChange={setBannerCropOpen}
        communityTag={communityTag}
        event={event}
        onSaved={onUpdate}
        showToast={showToast}
      />

    </div>
  );
}
