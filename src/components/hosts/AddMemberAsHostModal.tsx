"use client";

import { useEventManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import { PersonPickerModal, type PersonSearchResult } from "@cobuntu/management-ui-shared";

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
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;

    async function addHost(people: PersonSearchResult[]) {
        /* Single-pick, so the list holds exactly one — a host is added one at
           a time, which is what the picker's `multiple={false}` guarantees. */
        const person = people[0];
        const res = await fetch(`${config.apiBaseUrl}/api/events/${eventId}/hosts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...config.authHeaders() },
            body: JSON.stringify({ userId: person.id }),
        });
        if (res.ok) return;

        /*
         * Thrown, not returned: the picker keeps the pick and shows the
         * message, so a 409 does not cost the operator the person they chose.
         */
        const body = await res.json().catch(() => null);
        if (res.status === 409) throw new Error("This person is already a host.");
        if (res.status === 403) throw new Error("You don't have permission to add hosts on this event.");
        throw new Error(body?.error || body?.message || `Failed (${res.status})`);
    }

    return (
        <PersonPickerModal
            open={open}
            onClose={onClose}
            apiBaseUrl={config.apiBaseUrl}
            authHeaders={config.authHeaders}
            communityTag={communityTag}
            excludeUserIds={excludeUserIds}
            UserAvatar={UserAvatar}
            copy={{
                title: "Add community member as host",
                searchSubtitle: "Search members of this community. Guests and non-members are filtered out.",
                pickedSubtitle: "They'll appear in the hosts list and can manage the event.",
                searchPlaceholder: "Search by name or @usertag",
                /* Not "start typing" any more: the roster is already on screen,
                   so this only shows for a community with nobody to list. */
                emptyHint: "No members to show.",
                searching: "Searching…",
                noMatches: "No matches.",
                unknown: "Unknown",
                consequencesTitle: "What happens next",
                stepOne: "Choose a person",
                stepTwo: "Review",
                back: "Back",
                cancel: "Cancel",
                confirm: "Add as host",
                confirming: "Adding…",
                membersLabel: "Members",
                showingLabel: "Showing",
                allMembersLabel: "All members",
                selectedLabel: (n: number) => `${n} selected`,
            }}
            stepTwo={{
                kind: "consequences",
                items: [
                    "They appear in the hosts list and can manage the event.",
                    "They get an email letting them know they're now a host.",
                    "No payment changes hands. They're not an attendee.",
                ],
            }}
            multiple={false}
            onConfirm={addHost}
            /* The prop's own contract is one Member, and it stays that way:
               every caller renders a single host row from it. Unwrapping here
               rather than widening the prop keeps that promise. */
            onAdded={(people) => onAdded(people[0])}
        />
    );
}
