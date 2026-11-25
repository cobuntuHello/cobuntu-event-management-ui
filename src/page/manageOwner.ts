/**
 * WHO OWNS THIS EVENT, AND WHAT IS THE VIEWER TO IT.
 *
 * The manage header used to say "Live · 48 attendees · EUR 20" under the
 * title. Every one of those is on the page already (the status in its bar, the
 * count and the price on Overview), and none of them answers what someone
 * opening /manage actually needs first: whose event this is, and whether they
 * are here to run it or only to look at it. A leader reviewing a member's
 * event and the host running it saw the same header.
 *
 * So the header shows the OWNER (the community for a community-owned event,
 * else the member who created it) and the viewer's RELATIONSHIP to it. Both
 * are worked out here, from the event payload alone, so the community app and
 * the admin classify a viewer the same way. The words are the app's, like the
 * header's other labels: an app maps a `ManageRelationship` to its own copy.
 */

/** The owner's mark: a community is a rounded square, a person a circle. */
export type ManageOwner =
  | {
      kind: "community";
      id: string | null;
      name: string;
      communityTag: string | null;
      iconUrl: string | null;
    }
  | {
      kind: "person";
      id: string | null;
      name: string;
      usertag: string | null;
      profileImage: string | null;
    };

/**
 * The viewer's relationship to the item, one per case the header words:
 *
 *   owner            a member's item, and the viewer is that member
 *   cohost           a host who is not the owner (events)
 *   collaborator     a collaborator who is not the owner (products, courses)
 *   leaderHosting    a leader of the community that OWNS the item
 *   leaderReviewing  a leader of a community that only CARRIES someone's item,
 *                    who reviews it and cannot change it
 *
 * Shared with the product package's twin, which returns `collaborator` where
 * this returns `cohost`.
 */
export type ManageRelationship =
  | "owner"
  | "cohost"
  | "collaborator"
  | "leaderHosting"
  | "leaderReviewing";

export interface ManageViewer {
  /** The signed-in viewer. Unknown means no relationship: never guess one. */
  viewerUserId?: string | null;
  /** Does the viewer lead the community with this tag? */
  leads?: (communityTag: string) => boolean;
  /**
   * The community this page is opened in: the site in the community app, the
   * community whose admin it is in the admin app. Used for the carrying
   * community, and for the owning one when the payload does not name its tag.
   */
  communityTag?: string | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** The host row that owns a member's event: its CREATOR, the backend's rule. */
function creatorHost(event: any): any | null {
  const hosts: any[] = Array.isArray(event?.hosts) ? event.hosts : [];
  return (
    hosts.find((h) => h?.role === "CREATOR") ??
    hosts.find((h) => h?.userId && h.userId === event?.createdByUserId) ??
    null
  );
}

/**
 * The owner of an event, or null when the payload cannot say.
 *
 * `communityId` is the whole test for community ownership: the backend writes
 * it only for a community-owned event, and `viewerOwnsEvent` turns on it. The
 * community's name and icon come from its own listing row, which every
 * community-owned event has; `hostCommunity` is the backend's pick of the same
 * row and covers a payload that trimmed `communities`.
 */
export function eventManageOwner(event: any): ManageOwner | null {
  if (!event) return null;
  if (event.communityId) {
    const rows: any[] = Array.isArray(event.communities) ? event.communities : [];
    const row = rows.find((l) => (l?.community?.id ?? l?.communityId) === event.communityId);
    const fromHost = event.hostCommunity?.id === event.communityId ? event.hostCommunity : null;
    const c = row?.community ?? fromHost;
    const name = str(c?.name);
    if (!name) return null;
    return {
      kind: "community",
      id: str(c?.id) ?? str(event.communityId),
      name,
      communityTag: str(c?.communityTag) ?? str(c?.tagLower),
      iconUrl: str(c?.iconUrl),
    };
  }
  const host = creatorHost(event);
  const user = host?.user ?? null;
  const name = str(user?.name) ?? str(user?.usertag);
  if (!name) return null;
  return {
    kind: "person",
    id: str(user?.id) ?? str(host?.userId),
    name,
    usertag: str(user?.usertag),
    profileImage: str(user?.profileImage) ?? str(user?.imageUrl),
  };
}

/**
 * What the viewer is to this event, or null when none of the cases fits (an
 * unknown viewer, or Cobuntu staff opening an event they have no role in). The
 * header then shows the owner alone rather than a relationship that is not
 * true.
 *
 * The order is the point:
 *
 *   - A COMMUNITY-OWNED event: a leader of the owning community is hosting it
 *     as a leader, even when they are also on the host list, because that is
 *     the capacity they run it in. `viewerCanEdit === false` demotes them to
 *     reviewing: a leader whose role cannot edit events must not be told they
 *     manage one. A member co-host who leads nothing is a co-host.
 *   - A MEMBER'S event: its creator owns it, whatever else they lead. Another
 *     host is a co-host. A leader with no host row is reviewing an event their
 *     community carries, which is the read-only case.
 */
export function eventManageRelationship(event: any, viewer: ManageViewer): ManageRelationship | null {
  const uid = viewer.viewerUserId;
  if (!event || !uid) return null;
  const leads = (tag: string | null | undefined) => !!tag && !!viewer.leads?.(tag);
  const hosts: any[] = Array.isArray(event.hosts) ? event.hosts : [];
  const isHost = hosts.some((h) => h?.userId === uid);

  if (event.communityId) {
    const owner = eventManageOwner(event);
    const owningTag = owner?.kind === "community" ? owner.communityTag : null;
    if (leads(owningTag ?? viewer.communityTag) && event.viewerCanEdit !== false) return "leaderHosting";
    if (isHost) return "cohost";
    if (leads(viewer.communityTag)) return "leaderReviewing";
    return null;
  }

  const isOwner = event.viewerIsOwner === true || creatorHost(event)?.userId === uid;
  if (isOwner) return "owner";
  if (isHost) return "cohost";
  if (leads(viewer.communityTag)) return "leaderReviewing";
  return null;
}
