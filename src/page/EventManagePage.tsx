"use client";

import * as React from "react";
import { SectionsNav, type ViewKey } from "./sections/SectionsNav";
import { ViewTransition } from "./ViewTransition";
import { DetailsView } from "./views/DetailsView";
import { HostsView } from "./views/HostsView";
import { AgendaView } from "./views/AgendaView";
import { AttendeesView } from "./views/AttendeesView";
import { ListingsView } from "./views/ListingsView";
import { UpdatesView } from "./views/UpdatesView";
import { EventActivityTab } from "../components/activity/EventActivityTab";
import { getEventManagementConfig } from "../config";
import { EventManageHeader, type EventManageHeaderProps } from "./EventManageHeader";
import { ManageAccessProvider } from "../lib/manageAccess";

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
  /**
   * Whether the host is passing a Ledger panel.
   *
   * A parameter rather than a read of the slot: this function is exported and
   * tested on its own, away from any rendered tree.
   */
  hasLedger?: boolean;
}): ViewKey[] {
  /*
   * "details" MUST be here, not only in the nav's SECTIONS list. SectionsNav
   * renders the intersection of the two, so a tab added in one place and not
   * the other is silently dropped -- which is what happened on the product side
   * and made editing unreachable in production.
   */
  // "listings" absent: Overview carries them. The key still resolves, so an
  // existing ?view=listings link keeps working rather than falling through.
  const base: ViewKey[] = [
    "overview", "details",
    // After Details, always. The nav's SECTIONS array is what orders it.
    ...(opts.hasLedger ? (["ledger"] as ViewKey[]) : []),
    "attendees", "hosts", "agenda",
  ];
  const isHost = !!opts.viewerUserId
    && (opts.event?.hosts ?? []).some((h: any) => h?.userId === opts.viewerUserId);
  const isModerator = opts.forceModerator || !isHost;
  return isModerator ? [...base, "activity"] : base;
}

export interface EventManagePageProps {
  /**
   * What the Overview tab renders: the host app's `<ManageOverview>`.
   *
   * A slot rather than something this package builds, so the dashboard can use
   * the current shared package while this one keeps its own pin.
   */
  overviewSlot?: React.ReactNode;
  /**
   * The Ledger tab: every money movement for this event.
   *
   * A slot like the Overview, so this package's shared pin stays independent of
   * the dashboard's. Absent means the tab does not appear -- a host on an older
   * pin shows one tab fewer, not a tab opening onto nothing.
   */
  ledgerSlot?: React.ReactNode;
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

  /**
   * The shared header's inputs. Preferred over `header`: passing these gets
   * both apps the SAME breadcrumbs, icons and buttons, which is the whole
   * point — a slot per app is how the two headers diverged in the first place.
   */
  headerProps?: EventManageHeaderProps;

  /** Escape hatch for a genuinely app-specific header. Wins over headerProps. */
  header?: React.ReactNode;

  /** Communities the viewer belongs to, for the Listings tab. */
  hubs?: React.ComponentProps<typeof ListingsView>["hubs"];

  viewerUserId?: string | null;
  /** True on inherently-moderation surfaces (the admin app). */
  forceModerator?: boolean;
  /**
   * May this viewer CHANGE the event, as opposed to merely open this page?
   *
   * Send the backend's `viewerCanEdit`. It is resolved by the same predicate
   * the write endpoints enforce, so the interface and the server agree about
   * what will be accepted.
   *
   * False renders the page read-only: every editing surface stops opening, and
   * a banner explains why and where to go instead. Used for a leader of a
   * community that CARRIES someone else's event — they may look at it, and the
   * terms are changed through the listing conversation, not here.
   *
   * DEFAULTS TRUE so existing consumers are unchanged.
   */
  canEdit?: boolean;
}

export function EventManagePage({
  overviewSlot,
  ledgerSlot,
  communityTag,
  eventId,
  event,
  onUpdate,
  onDelete,
  showToast,
  view,
  onViewChange,
  headerProps,
  header,
  hubs,
  viewerUserId,
  forceModerator,
  // Defaults true: every consumer that has not been taught about this renders
  // exactly as it did before, and read-only is opt-in by the page that knows
  // it is showing someone else's event.
  canEdit = true,
}: EventManagePageProps) {
  // Touch the config early so a host app that forgot the provider fails here,
  // loudly, rather than three views deep on a fetch.
  getEventManagementConfig();

  const allowed = React.useMemo(
    () => visibleViews({ event, viewerUserId, forceModerator, hasLedger: !!ledgerSlot }),
    [event, viewerUserId, forceModerator, ledgerSlot],
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
    /*
     * DETAILS keeps every prop the old Overview had. Same view, renamed and
     * moved second.
     */
    case "details":
      content = (
        <DetailsView
          event={event}
          communityTag={communityTag}
          eventId={eventId}
          isPublished={isPublished}
          onUpdate={onUpdate}
          onDelete={onDelete}
          showToast={showToast}
        />
      );
      break;

    case "ledger":
      /* A slot, like the Overview -- the host fetches it. */
      content = ledgerSlot ?? null;
      break;

    case "overview":
    default:
      /*
       * A SLOT, not a component this package owns.
       *
       * The dashboard is ManageOverview in @cobuntu/management-ui-shared.
       * Importing it here would tie this package's shared pin to the
       * dashboard's, as a side effect of adding a tab. Both host apps already
       * run the current shared package, so they render it and pass it in --
       * the same shape as the community app keeping its own tab strip.
       *
       * Omitted, the tab renders nothing rather than crashing an un-updated
       * host.
       */
      content = overviewSlot ?? null;
  }

  return (
    /*
     * The nav sits OUTSIDE the provider's read-only effect on purpose: moving
     * between tabs is reading, not writing, and a read-only viewer is here
     * precisely to look around.
     */
    <ManageAccessProvider canEdit={canEdit}>
      <div>
        {header ?? (headerProps ? <EventManageHeader {...headerProps} /> : null)}
        {!canEdit && <ReadOnlyNotice event={event} communityTag={communityTag} />}
        <SectionsNav communityTag={communityTag} activeView={active} onViewChange={onViewChange} visibleViews={allowed} />
        <ViewTransition viewKey={active}>{content}</ViewTransition>
      </div>
    </ManageAccessProvider>
  );
}

/**
 * Says WHOSE event this is and where changes actually happen.
 *
 * A page that simply refuses to save reads as broken. Naming the owner and
 * pointing at the listing conversation makes it a relationship rather than a
 * malfunction: the community decides whether it carries this and on what
 * terms, and the host decides what it is.
 */
/**
 * What the read-only notice should say, and why it differs.
 *
 * TWO reasons a viewer lands here without edit rights, needing different words.
 *
 *   1. A MEMBER owns the event and this community merely carries it.
 *      `events.communityId` is null. Changes are the host's to make and the
 *      listing conversation is where to ask. This is the case the notice was
 *      originally written for.
 *
 *   2. THIS COMMUNITY owns the event (`events.communityId` is set) and the
 *      viewer simply lacks the role. `viewerOwnsEvent` returns false for every
 *      community-owned event by design, so edit rights come solely from
 *      EVENTS_CREATE in the owning community. Without it a leader was shown
 *      "<member> runs this event. Your community carries it" about an event
 *      their own community owns and collects the money for, naming whoever
 *      happened to create the row. For a community's recurring events that is
 *      the same member every time. It reads as the platform having lost track
 *      of who owns what, and it points at a negotiation that does not exist.
 *
 * Exported and pure so it can be tested without the page's config providers,
 * the same shape as `visibleViews`.
 */
export function readOnlyNoticeCopy(event: any): { title: string; body: string } {
  const ownerName =
    event?.hosts?.find((h: any) => h.role === "CREATOR")?.user?.name
    || event?.hosts?.[0]?.user?.name
    || null;

  if (event?.communityId) {
    return {
      title: "Your community owns this event.",
      body: "You do not have permission to change it. A community leader with event permissions can edit it, or grant you that permission.",
    };
  }

  return {
    title: ownerName ? `${ownerName} runs this event.` : "This event belongs to its host.",
    body: "Your community carries it, so you manage the listing: the terms, the commission, and whether it stays on your shelf. Ask the host through the listing conversation to change the event itself.",
  };
}

/**
 * WHO owns it, with their face on it.
 *
 * ── Why this is not a warning ───────────────────────────────────────────────
 *
 * It used to be an amber banner, and amber means SOMETHING IS WRONG. Nothing is
 * wrong here: the event simply belongs to someone else, which is a permanent
 * fact about it rather than a problem to resolve. Rendering a fact in the
 * colour of an error trains people to ignore the colour.
 *
 * ── Why it shows a face ─────────────────────────────────────────────────────
 *
 * The old version asserted ownership in prose without ever showing who. On a
 * page about one event, inside a community the reader belongs to, "your
 * community owns this" is abstract — the icon they recognise from the sidebar
 * is not. So the owner is identified the way they are everywhere else: their
 * image, their name.
 *
 * A community icon is SQUARE-ish and a person's photo is round, matching how
 * each is drawn everywhere else in the product. That is the one visual cue
 * telling the reader whether they are looking at an organisation or a person,
 * and it costs nothing to keep.
 */
export function readOnlyOwner(event: any): {
  kind: "community" | "person";
  name: string;
  imageUrl: string | null;
} | null {
  if (event?.communityId) {
    // The OWNING community, not merely a carrying one — an event can be listed
    // in several, and only one of them owns it.
    const owning = (event?.communities ?? []).find(
      (c: any) => c?.communityId === event.communityId || c?.community?.id === event.communityId,
    );
    const community = owning?.community ?? null;
    return {
      kind: "community",
      name: community?.name || "Your community",
      imageUrl: community?.iconUrl ?? null,
    };
  }

  const creator = event?.hosts?.find((h: any) => h.role === "CREATOR") ?? event?.hosts?.[0];
  const user = creator?.user ?? null;
  if (!user) return null;
  return {
    kind: "person",
    name: user.name || user.usertag || "the host",
    imageUrl: user.profileImage ?? null,
  };
}

function OwnerAvatar({ owner }: { owner: NonNullable<ReturnType<typeof readOnlyOwner>> }) {
  // Square for an organisation, round for a person.
  const shape = owner.kind === "community" ? "rounded-[10px]" : "rounded-full";

  if (owner.imageUrl) {
    return (
      <img
        src={owner.imageUrl}
        alt=""
        className={`h-10 w-10 shrink-0 object-cover ring-1 ring-black/5 ${shape}`}
      />
    );
  }
  // No image: the initial on a muted plate. Never a broken-image frame, and
  // never a blank circle, which reads as something that failed to load.
  return (
    <span
      aria-hidden="true"
      className={`grid h-10 w-10 shrink-0 place-items-center bg-zinc-100 text-[15px] font-medium text-zinc-500 ring-1 ring-black/5 ${shape}`}
    >
      {owner.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function ReadOnlyNotice({ event, communityTag }: { event: any; communityTag: string }) {
  const { title, body } = readOnlyNoticeCopy(event);
  const owner = readOnlyOwner(event);

  return (
    <div
      role="note"
      /*
       * NO dark: VARIANTS. Neither host app has a dark mode.
       *
       * Tailwind resolves `dark:` from prefers-color-scheme by default, so on a
       * machine set to dark these fired while every surface around them stayed
       * light. The banner looked broken to anyone whose OS was dark and correct
       * to everyone else, which is why it survived so long.
       */
      className="mb-4 flex items-start gap-3.5 rounded-xl border border-zinc-200 bg-white px-4 py-3.5"
    >
      {owner && <OwnerAvatar owner={owner} />}
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-zinc-900">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-500">{body}</p>
      </div>
    </div>
  );
}
