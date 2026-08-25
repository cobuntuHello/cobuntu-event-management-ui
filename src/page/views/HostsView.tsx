"use client";

import { useEffect, useMemo, useState } from "react";
import { HostsManagementSection } from "@cobuntu/event-management-ui";
import { getEventManagementConfig } from "../../config";
import { apiBase } from "../helpers";


interface Props {
    event: any;
    communityTag: string;
    eventId: string;
    /** No-op now — the shared section self-refreshes. Kept for prop compat. */
    onUpdate?: () => void;
    /** No-op now — the shared section surfaces errors inline. Kept for prop compat. */
    showToast?: (msg: string) => void;
}

/**
 * Hosts management view — thin wrapper around the shared
 * `HostsManagementSection` from @cobuntu/event-management-ui.
 *
 * Fetches the signed-in user once on mount so the section can
 * detect self-removal and rephrase the confirm-removal warning in the
 * second person ("You'll still…" vs "[Name] will still…"). Community
 * name is derived from the event payload's communities[] relation
 * (already loaded by the parent page; no extra fetch needed).
 *
 * The page-level layout gates access to hosts + leaders, so canManage
 * is true whenever this component renders.
 */
export function HostsView({ event, communityTag, eventId }: Props) {
    const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Whatever the host app uses for auth — the package never
                // reads a token itself.
                const headers = getEventManagementConfig().authHeaders();
                if (!headers.Authorization) return;
                const res = await fetch(`${apiBase()}/api/users/me`, { headers });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                const userId = data?.user?.id || data?.id;
                if (userId) setCurrentUserId(userId);
            } catch { /* silent — currentUserId stays undefined → no self-voice warning */ }
        })();
        return () => { cancelled = true; };
    }, []);

    const communityName = useMemo<string | undefined>(() => {
        const c = event?.communities?.[0]?.community || event?.communities?.[0];
        return c?.name;
    }, [event?.communities]);

    return (
        <HostsManagementSection
            event={{
                id: event?.id || eventId,
                communityId: event?.communityId ?? null,
                createdByUserId: event?.createdByUserId,
                endDate: event?.endDate ?? null,
            }}
            communityTag={communityTag}
            communityName={communityName}
            canManage={true}
            currentUserId={currentUserId}
        />
    );
}
