"use client";

import { useMemo, useState } from "react";
import {
    AttendeesAndInvitationsSection,
    PromoteAttendeeModal,
} from "@cobuntu/event-management-ui";
import { AddAttendeesModal } from "../modals/AddAttendeesModal";
import { InviteGuestsModal } from "../modals/InviteGuestsModal";

/**
 * Unified Attendees tab — replaces the legacy "Add Attendees" and
 * "Invite Guests" tabs. Mounts AttendeesAndInvitationsSection (the
 * full attendee list with status pills, refund flow, attendee drawer)
 * and wires its header [Add] / [Invite] buttons to local modal state.
 *
 * Plan: feat/manage-event-restructure umbrella, attendees-unified sub-PR.
 *
 * The paid-event revenue KPIs are mounted on Overview now (see
 * OverviewView), not here.
 *
 * Promote-to-host: the per-attendee drawer surfaces a "Promote to host"
 * action when the viewer is the event creator and the attendee is
 * APPROVED but not yet a host. Clicking it opens PromoteAttendeeModal
 * preselected to that attendee. The legacy "Add Co-Host" (host search,
 * bypasses payment) lives in HostsView and stays as a separate path.
 */

interface Props {
    event: any;
    communityTag: string;
    eventId: string;
    isPublished: boolean;
    isPast?: boolean;
    onUpdate: () => void;
    showToast: (msg: string) => void;
}

export function AttendeesView({
    event,
    communityTag,
    eventId,
    isPublished,
    isPast,
    onUpdate,
    showToast,
}: Props) {
    const [modal, setModal] = useState<"add" | "invite" | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [promotePreselected, setPromotePreselected] = useState<any | null>(null);

    const isCreator = event?.hosts?.some((h: any) => h.role === "CREATOR") ?? true;
    const hostUserIds = useMemo(() => {
        const s = new Set<string>();
        for (const h of event?.hosts || []) {
            const uid = h.user?.id || h.userId;
            if (uid) s.add(uid);
        }
        return s;
    }, [event?.hosts]);

    function canPromote(attendee: any): boolean {
        // Match the Hosts-tab "Promote attendee" button: only the creator,
        // only on a non-past event, only for an APPROVED attendee who
        // isn't already a host. The HostsView gates on isPast already;
        // mirror it here so the drawer's per-attendee action stays
        // consistent with the section-header path.
        if (!isCreator) return false;
        if (isPast) return false;
        const status = (attendee?.status || "APPROVED").toUpperCase();
        if (status !== "APPROVED") return false;
        const uid = attendee?.userId || attendee?.user?.id || attendee?.id;
        if (!uid) return false;
        return !hostUserIds.has(uid);
    }

    return (
        <>
            <AttendeesAndInvitationsSection
                event={event}
                communityTag={communityTag}
                eventIdOrSlug={eventId}
                isPublished={isPublished}
                isPast={!!isPast}
                refreshKey={refreshKey}
                onAddClick={() => setModal("add")}
                onInviteClick={() => setModal("invite")}
                canPromoteAttendeeToHost={canPromote}
                onPromoteAttendeeFromDrawer={(a) => setPromotePreselected(a)}
            />

            {modal === "add" && (
                <AddAttendeesModal
                    event={event}
                    communityTag={communityTag}
                    eventId={eventId}
                    showToast={showToast}
                    onUpdate={() => {
                        onUpdate();
                        setRefreshKey((k) => k + 1);
                    }}
                    onClose={() => setModal(null)}
                    onSwitchToInvite={() => setModal("invite")}
                />
            )}

            {modal === "invite" && (
                <InviteGuestsModal
                    event={event}
                    communityTag={communityTag}
                    eventId={eventId}
                    showToast={showToast}
                    onClose={() => {
                        setModal(null);
                        onUpdate();
                        setRefreshKey((k) => k + 1);
                    }}
                />
            )}

            <PromoteAttendeeModal
                eventId={event?.id || eventId}
                eligibleAttendees={(event?.attendees || []).filter(canPromote)}
                preselected={promotePreselected}
                open={promotePreselected !== null}
                onClose={() => setPromotePreselected(null)}
                onPromoted={() => {
                    showToast("Promoted to host");
                    onUpdate();
                    setRefreshKey((k) => k + 1);
                }}
            />
        </>
    );
}
