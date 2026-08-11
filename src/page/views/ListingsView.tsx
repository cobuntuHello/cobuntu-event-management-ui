"use client";

import { useMemo } from "react";
import { EventListingsSection, type AvailableCommunity } from "../../components/EventListingsSection";

interface Props {
  event: any;
  communityTag: string;
  onUpdate: () => void;
  showToast: (msg: string) => void;
  /**
   * Communities this viewer belongs to, with whether they lead each one.
   * Supplied by the host app: the admin app reads it from its auth context,
   * the community app from its membership context. The package has no
   * business knowing where a hub list comes from.
   */
  hubs?: Array<{
    community: { communityTag: string; name: string; iconUrl?: string | null };
    roleGroups?: Array<{ isSystem?: boolean; permissions?: string[] }>;
  }>;
}

/**
 * Listings tab. Hosts manage which communities surface this event on
 * their public events listing. Each row in the picker is a hub the
 * current admin user belongs to; EVENTS_MANAGE_LISTINGS holders get
 * the instant-add (leader) path, others get the request/commission
 * path.
 *
 * Was previously a card inline on Overview; promoted to its own tab
 * because the hub list grows quickly for users who admin multiple
 * communities, and the inline card competed for screen real estate
 * with the Settings + per-field quick edits.
 */
export function ListingsView({ event, onUpdate, showToast, hubs }: Props) {

  const availableCommunities = useMemo<AvailableCommunity[]>(
    () => (hubs || []).map((h: any) => ({
      communityTag: h.community.communityTag,
      communityName: h.community.name,
      communityIconUrl: h.community.iconUrl,
      isLeader: h.roleGroups?.some(
        (rg: any) => rg.isSystem || rg.permissions?.includes("EVENTS_MANAGE_LISTINGS"),
      ) || false,
    })),
    [hubs],
  );

  // 2026-06-18: dropped the "Manage Listings" wrapper header — the
  // tab name already names the surface, and EventListingsSection has
  // its own "Listings" header inside.
  return (
    <EventListingsSection
      event={event}
      availableCommunities={availableCommunities}
      onUpdate={onUpdate}
      showToast={showToast}
    />
  );
}
