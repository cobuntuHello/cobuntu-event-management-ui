"use client";

import * as React from "react";
import { SectionsNav, type ViewKey } from "./sections/SectionsNav";
import { ViewTransition } from "./ViewTransition";
import { OverviewView } from "./views/OverviewView";
import { HostsView } from "./views/HostsView";
import { AgendaView } from "./views/AgendaView";
import { AttendeesView } from "./views/AttendeesView";
import { ListingsView } from "./views/ListingsView";
import { UpdatesView } from "./views/UpdatesView";
import { EventActivityTab } from "../components/activity/EventActivityTab";
import { getEventManagementConfig } from "../config";

/**
 * THE event manage page. One implementation, both apps.
 *
 * It used to live in the admin app's own _components/, which is the whole
 * reason the two apps drifted: the package exported a KIT (forms, modals,
 * drawers) and never the PAGE, so the community app composed its own simpler
 * one from the same parts and nothing forced the two to converge. Admin's got
 * months of refinement; the other didn't.
 *
 * WHAT THE HOST APP STILL OWNS, deliberately:
 *
 *   the URL      `view` / `onViewChange`. The admin app keeps its ?view= query
 *                param; the community app may want a path segment. Owning the
 *                router here would force one on both.
 *   the chrome   `header` and `skeleton` are slots. Each app's page header is
 *                part of ITS shell, not of this page.
 *   the hubs     which communities the viewer belongs to comes from auth in
 *                one app and membership context in the other.
 *
 * Everything else — the tabs, the views, the edit rows, the modals — is here,
 * so a change lands in both apps or neither.
 */

export type { ViewKey };

/**
 * Which tabs this viewer gets.
 *
 * A member hosting their own event is not a community leader, so the page
 * cannot simply show everything. Activity and Updates are moderation surfaces:
 * an audit log across the community's events, and community-wide broadcasts.
 * A host gets the tabs that operate THEIR event.
 *
 * Derived the same way the manage-intercept sheet derives it — is the viewer
 * in `hosts[]`? — so one rule, not two that can disagree. A host who is ALSO a
 * leader gets the leader set, because the more permissive of the two is the
 * true answer.
 */
export function visibleViews(opts: {
  event: any;
  viewerUserId?: string | null;
  /** Host app override — the admin app is a moderation surface by definition. */
  forceModerator?: boolean;
}): ViewKey[] {
  const base: ViewKey[] = ["overview", "attendees", "hosts", "agenda", "listings"];
  const isHost = !!opts.viewerUserId
    && (opts.event?.hosts ?? []).some((h: any) => h?.userId === opts.viewerUserId);
  const isModerator = opts.forceModerator || !isHost;
  return isModerator ? [...base, "activity"] : base;
}

export interface EventManagePageProps {
  communityTag: string;
  /** Slug or id, whichever the host app routes on. */
  eventId: string;
  /** The loaded event. The host app owns the fetch so it can gate the route. */
  event: any;
  /** Re-fetch after a mutation. */
  onUpdate: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  showToast: (msg: string) => void;

  view: ViewKey;
  onViewChange: (v: ViewKey) => void;

  /** Rendered above the tabs — each app's own page header. */
  header?: React.ReactNode;

  /** Communities the viewer belongs to, for the Listings tab. */
  hubs?: React.ComponentProps<typeof ListingsView>["hubs"];

  viewerUserId?: string | null;
  /** True on inherently-moderation surfaces (the admin app). */
  forceModerator?: boolean;
}

export function EventManagePage({
  communityTag,
  eventId,
  event,
  onUpdate,
  onDelete,
  showToast,
  view,
  onViewChange,
  header,
  hubs,
  viewerUserId,
  forceModerator,
}: EventManagePageProps) {
  // Touch the config early so a host app that forgot the provider fails here,
  // loudly, rather than three views deep on a fetch.
  getEventManagementConfig();

  const allowed = React.useMemo(
    () => visibleViews({ event, viewerUserId, forceModerator }),
    [event, viewerUserId, forceModerator],
  );

  // A ?view= the viewer may not use falls back rather than rendering an empty
  // frame — URLs get shared between people with different roles.
  const active: ViewKey = allowed.includes(view) ? view : "overview";

  const isPublished = React.useMemo(() => {
    const listing = event?.communities?.[0];
    return !!listing && !listing.isHidden && listing.status === "ACTIVE";
  }, [event]);

  let content: React.ReactNode;
  switch (active) {
    case "hosts":
      content = <HostsView event={event} communityTag={communityTag} eventId={eventId} onUpdate={onUpdate} showToast={showToast} />;
      break;
    case "agenda":
      content = <AgendaView event={event} communityTag={communityTag} eventId={eventId} showToast={showToast} />;
      break;
    case "attendees":
      content = (
        <AttendeesView
          event={event}
          communityTag={communityTag}
          eventId={eventId}
          isPublished={isPublished}
          isPast={event?.endDate ? new Date(event.endDate) < new Date() : false}
          onUpdate={onUpdate}
          showToast={showToast}
        />
      );
      break;
    case "listings":
      content = <ListingsView event={event} communityTag={communityTag} onUpdate={onUpdate} showToast={showToast} hubs={hubs} />;
      break;
    case "activity":
      content = <EventActivityTab event={event} communityTag={communityTag} />;
      break;
    case "updates":
      content = <UpdatesView communityTag={communityTag} eventId={eventId} showToast={showToast} />;
      break;
    case "overview":
    default:
      content = (
        <OverviewView
          event={event}
          communityTag={communityTag}
          eventId={eventId}
          isPublished={isPublished}
          onUpdate={onUpdate}
          onDelete={onDelete}
          showToast={showToast}
        />
      );
  }

  return (
    <div>
      {header}
      <SectionsNav communityTag={communityTag} activeView={active} onViewChange={onViewChange} visibleViews={allowed} />
      <ViewTransition viewKey={active}>{content}</ViewTransition>
    </div>
  );
}
