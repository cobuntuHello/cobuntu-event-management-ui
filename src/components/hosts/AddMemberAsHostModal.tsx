"use client";

import { useEventManagementConfig } from "../../config";
import { useEventT } from "../../create-wizard/i18n";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import { PersonPickerModal, userIdsOf, type Recipient } from "@cobuntu/management-ui-shared";

/**
 * Add a community member as a host of an event.
 *
 * The browse-pick-confirm flow lives in @cobuntu/management-ui-shared's
 * PersonPickerModal, so this file is now the EVENTS HALF of it: the endpoint,
 * its error vocabulary, and the three sentences describing what being made a
 * host actually does.
 *
 * WHAT CHANGED FOR THE OPERATOR: the community's members are on screen when it
 * opens, grouped by role with leaders first, instead of an empty box saying
 * "start typing". Typing narrows that list. Adding a host to your own community
 * no longer requires knowing the person's exact handle before you begin.
 *
 * Nothing visible changed here. The move was for the product package, whose
 * co-seller equivalent was a bare "@usertag" text box posting a field the API
 * never read — it answered `400 userId is required` and had never once worked.
 * Both surfaces now search the same way and send an id that came back from the
 * server.
 *
 * Talks to:
 *   GET  /api/communities/:tag/members/search?q=…&excludeUserIds=…
 *        (inside the shared picker; the server filters non-members and
 *        already-hosts, so excluded people never reach the list)
 *   POST /api/events/:eventId/hosts  { userId }
 *        The BE writes an event_host_audits row on success.
 */

interface Member {
    id: string;
    name: string | null;
    usertag: string | null;
    profileImage: string | null;
}

export interface AddMemberAsHostModalProps {
    eventId: string;
    communityTag: string;
    /**
     * userIds the caller wants to exclude from the autocomplete (typically
     * the IDs of users who are already hosts of this event). The BE
     * filters server-side so excluded users never appear in the response.
     */
    excludeUserIds: string[];
    open: boolean;
    onClose: () => void;
    onAdded: (member: Member) => void;
}

export function AddMemberAsHostModal({
    eventId,
    communityTag,
    excludeUserIds,
    open,
    onClose,
    onAdded,
}: AddMemberAsHostModalProps) {
    const config = useEventManagementConfig();
    const tx = useEventT("eventsUi.manageUi.addMemberAsHostModal");
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;

    async function addHost(recipients: Recipient[]) {
        /* Single-pick, so the list holds exactly one — a host is added one at
           a time, which is what the picker's `multiple={false}` guarantees.
           `userIdsOf` also drops anyone without an account, which this surface
           never stages: making somebody a host writes a row keyed by user id,
           so the picker is mounted without `emails`. */
        const [userId] = userIdsOf(recipients);
        if (!userId) throw new Error(tx("errChoose"));
        const res = await fetch(`${config.apiBaseUrl}/api/events/${eventId}/hosts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...config.authHeaders() },
            body: JSON.stringify({ userId }),
        });
        if (res.ok) return;

        /*
         * Thrown, not returned: the picker keeps the pick and shows the
         * message, so a 409 does not cost the operator the person they chose.
         */
        const body = await res.json().catch(() => null);
        if (res.status === 409) throw new Error(tx("errAlreadyHost"));
        if (res.status === 403) throw new Error(tx("errNoPermission"));
        if (res.status === 404) throw new Error(tx("errNotFound"));
        throw new Error(body?.error || body?.message || tx("errFailed", { status: res.status }));
    }

    return (
        <PersonPickerModal
            open={open}
            onClose={onClose}
            apiBaseUrl={config.apiBaseUrl}
            authHeaders={config.authHeaders}
            communityTag={communityTag}
            /* A co-host is not a membership role: a partner organisation's
               account can run an event listed in a community it never
               joined. The roster stays the list; search reaches everyone. */
            searchEveryone
            excludeUserIds={excludeUserIds}
            UserAvatar={UserAvatar}
            copy={{
                title: tx("title"),
                searchSubtitle: tx("searchSubtitle"),
                pickedSubtitle: tx("pickedSubtitle"),
                searchPlaceholder: tx("searchPlaceholder"),
                /* Not "start typing" any more: the roster is already on screen,
                   so this only shows for a community with nobody to list. */
                emptyHint: tx("emptyHint"),
                searching: tx("searching"),
                noMatches: tx("noMatches"),
                unknown: tx("unknown"),
                consequencesTitle: tx("consequencesTitle"),
                stepOne: tx("stepOne"),
                stepTwo: tx("stepTwo"),
                back: tx("back"),
                cancel: tx("cancel"),
                confirm: tx("confirm"),
                confirming: tx("confirming"),
                membersLabel: tx("membersLabel"),
                showingLabel: tx("showingLabel"),
                allMembersLabel: tx("allMembersLabel"),
                selectedLabel: (n: number) => tx("selectedLabel", { count: n }),
                /* Single-pick, so the staged strip never renders. The words
                   are still required: a surface that later allows several
                   hosts at once should not have to discover it needs them. */
                selectedTitle: tx("selectedTitle"),
                clearAll: tx("clearAll"),
                remove: (name: string) => tx("remove", { name }),
            }}
            stepTwo={{
                kind: "consequences",
                items: [
                    tx("consequence1"),
                    tx("consequence2"),
                    tx("consequence3"),
                ],
            }}
            multiple={false}
            onConfirm={addHost}
            /* The prop's own contract is one Member, and it stays that way:
               every caller renders a single host row from it. Unwrapping here
               rather than widening the prop keeps that promise. */
            onAdded={(recipients) => {
                const [r] = recipients;
                if (!r?.id) return;
                onAdded({
                    id: r.id,
                    name: r.name ?? null,
                    usertag: r.usertag ?? null,
                    profileImage: r.profileImage ?? null,
                });
            }}
        />
    );
}
