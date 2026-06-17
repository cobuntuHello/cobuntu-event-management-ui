"use client";

import { ModalShell } from "../ui/modal-shell";
import {
    MembershipFunnelSection,
    type MembershipFunnelSectionEvent,
    type MembershipFunnelSectionCommunity,
} from "./MembershipFunnelSection";

/**
 * Modal wrapper around MembershipFunnelSection — the host's three-radio
 * funnel config (None / EMBED / APPLY_LINK).
 *
 * Used by the SettingsDrawer row pattern: clicking the row closes the
 * drawer and opens this modal; closing the modal re-opens the drawer.
 * Identical configuration UX to the inline section that previously
 * rendered on the Overview tab.
 *
 * The underlying MembershipFunnelSection still handles its own
 * blocked-state explainer (when event accessibility/viewability are
 * wrong, or community is INVITE_ONLY) — including the "Open event
 * settings →" CTA which now means "Open the parent settings drawer".
 */

interface Props {
    event: MembershipFunnelSectionEvent;
    communityTag: string;
    community: MembershipFunnelSectionCommunity;
    onClose: () => void;
    onSaved: () => void;
    onRequestEditSettings: () => void;
    showToast?: (msg: string) => void;
}

export function MembershipFunnelEditModal({
    event,
    communityTag,
    community,
    onClose,
    onSaved,
    onRequestEditSettings,
    showToast,
}: Props) {
    return (
        <ModalShell onClose={onClose} width="w-full sm:w-[560px]">
            <MembershipFunnelSection
                event={event}
                communityTag={communityTag}
                community={community}
                onSaved={onSaved}
                onRequestEditSettings={onRequestEditSettings}
                showToast={showToast}
            />
        </ModalShell>
    );
}
