"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ViewabilityEditModal } from "./ViewabilityEditModal";
import { AccessibilityEditModal } from "./AccessibilityEditModal";
import { DistributionEditModal } from "./DistributionEditModal";
import { MembershipFunnelEditModal } from "./MembershipFunnelEditModal";
import type {
    MembershipFunnelSectionEvent,
    MembershipFunnelSectionCommunity,
} from "./MembershipFunnelSection";

/**
 * Settings drawer for the event-management Overview tab.
 *
 * Holds the host-config settings that aren't core event metadata
 * (name/date/location/pricing). Four clickable rows, each opens a
 * standalone modal:
 *
 *   - Visibility   (events.viewability — who can SEE)
 *   - Access       (events.accessibility — who can RSVP)
 *   - Distribution (NATIVE/EXTERNAL landing + Featured)
 *   - Membership funnel (None / EMBED / APPLY_LINK)
 *
 * Same interaction pattern as the legacy EditEventDrawer's sub-modal
 * flow: clicking a row visually closes the drawer + opens the modal;
 * closing the modal re-opens the drawer with the updated state. The
 * drawer doesn't own form state — each modal PUTs to the API itself
 * and calls onSaved() to trigger the parent's reload.
 *
 * Plan: cobuntu-backend-monorepo/docs/features/event-membership-funnel.md
 * (feat/manage-event-restructure umbrella, settings-drawer sub-PR).
 */

type ModalKey = "viewability" | "accessibility" | "distribution" | "funnel" | null;

interface Props {
    event: any;
    communityTag: string;
    /** Community shape required by MembershipFunnelEditModal. The parent
     *  page fetches this; the drawer just forwards it through. */
    community: MembershipFunnelSectionCommunity;
    isOpen: boolean;
    /**
     * When true, surfaces a one-line note at the top of the drawer that
     * Access / Featured / Membership funnel no longer change anything
     * for buyers because the event has ended. Settings stay editable
     * (Visibility + Distribution detailSource still have legitimate
     * post-event use). Defaults to false for backwards compatibility.
     */
    isPast?: boolean;
    onClose: () => void;
    onSaved: () => void;
    showToast: (msg: string) => void;
}

export function SettingsDrawer({
    event,
    communityTag,
    community,
    isOpen,
    isPast,
    onClose,
    onSaved,
    showToast,
}: Props) {
    const [visible, setVisible] = useState(false);
    const [animating, setAnimating] = useState(false);
    const [modal, setModal] = useState<ModalKey>(null);

    useEffect(() => {
        if (isOpen) {
            setVisible(true);
            requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
        } else {
            setAnimating(false);
            const timer = setTimeout(() => setVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Re-animate when returning from a sub-modal
    useEffect(() => {
        if (visible && !modal) {
            requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
        }
    }, [visible, modal]);

    function handleClose() {
        setAnimating(false);
        setTimeout(onClose, 300);
    }

    function openModal(key: ModalKey) {
        setAnimating(false);
        setTimeout(() => {
            setVisible(false);
            setModal(key);
        }, 300);
    }

    function closeModalAndReopenDrawer() {
        setModal(null);
        setVisible(true);
        // useEffect above re-animates the drawer back in
    }

    function modalSaved() {
        // Modal already showed its own toast + PUT. Forward to parent
        // for reload, then return the user to the drawer.
        onSaved();
        closeModalAndReopenDrawer();
    }

    // ─── Active sub-modal (mutually exclusive with the drawer) ──────
    if (modal === "viewability") {
        return (
            <ViewabilityEditModal
                event={event}
                communityTag={communityTag}
                onClose={closeModalAndReopenDrawer}
                onSaved={modalSaved}
                showToast={showToast}
            />
        );
    }
    if (modal === "accessibility") {
        return (
            <AccessibilityEditModal
                event={event}
                communityTag={communityTag}
                onClose={closeModalAndReopenDrawer}
                onSaved={modalSaved}
                showToast={showToast}
            />
        );
    }
    if (modal === "distribution") {
        return (
            <DistributionEditModal
                event={event}
                communityTag={communityTag}
                onClose={closeModalAndReopenDrawer}
                onSaved={modalSaved}
                showToast={showToast}
            />
        );
    }
    if (modal === "funnel") {
        return (
            <MembershipFunnelEditModal
                event={event as MembershipFunnelSectionEvent}
                communityTag={communityTag}
                community={community}
                onClose={closeModalAndReopenDrawer}
                onSaved={modalSaved}
                onRequestEditSettings={closeModalAndReopenDrawer}
                showToast={showToast}
            />
        );
    }

    // ─── Drawer ─────────────────────────────────────
    if (!visible) return null;
    if (typeof document === "undefined") return null;

    return createPortal(
        <>
            <div
                className={`fixed inset-0 z-50 transition-opacity duration-300 ${
                    animating ? "bg-black/50" : "bg-black/0"
                }`}
                onClick={handleClose}
            />

            <div
                className={`fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col rounded-l-2xl overflow-hidden transition-transform duration-300 ease-out ${
                    animating ? "translate-x-0" : "translate-x-full"
                }`}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 shrink-0">
                    <button
                        onClick={handleClose}
                        className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center cursor-pointer shrink-0"
                        aria-label="Close settings"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
                            <polyline points="13 17 18 12 13 7" />
                            <polyline points="6 17 11 12 6 7" />
                        </svg>
                    </button>
                    <h2 className="text-base font-semibold text-zinc-900">Settings</h2>
                </div>

                {/* Past-event note. Access / Featured / Membership funnel
                    can still be toggled (idempotent on the BE) but they
                    don't affect anything once the event has ended; flag
                    it once at the drawer level rather than per-row. */}
                {isPast && (
                    <div className="px-5 py-2.5 bg-zinc-50 border-b border-zinc-100 shrink-0">
                        <p className="text-[11px] text-zinc-500 leading-snug">
                            Event has ended. Access, Featured, and the membership funnel no longer affect new registrations — only Visibility and a custom landing URL still apply.
                        </p>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    <SettingsRow
                        label="Visibility"
                        summary={event.viewability === "MEMBERS_ONLY" ? "Members only" : "Public"}
                        onClick={() => openModal("viewability")}
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        }
                    />
                    <SettingsRow
                        label="Access"
                        summary={event.accessibility === "MEMBERS_ONLY" ? "Members only" : "Public"}
                        onClick={() => openModal("accessibility")}
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                                <rect x="3" y="11" width="18" height="11" rx="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                        }
                    />
                    <SettingsRow
                        label="Distribution"
                        summary={
                            (event.detailSource === "EXTERNAL" ? "Custom landing page" : "Cobuntu event page") +
                            (event.featured ? " · ⭐ Featured" : "")
                        }
                        onClick={() => openModal("distribution")}
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                                <path d="M4 4h16v6H4z" />
                                <path d="M4 14h16v6H4z" />
                                <circle cx="8" cy="7" r="1" fill="currentColor" />
                                <circle cx="8" cy="17" r="1" fill="currentColor" />
                            </svg>
                        }
                    />
                    <SettingsRow
                        label="Membership funnel"
                        summary={funnelSummary(event.funnelMode, event.funnelEmbedProvider)}
                        onClick={() => openModal("funnel")}
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                                <path d="M3 3h18l-7 9v7l-4 2v-9z" />
                            </svg>
                        }
                    />
                </div>
            </div>
        </>,
        document.body,
    );
}

function funnelSummary(mode: string | null | undefined, provider: string | null | undefined): string {
    if (!mode) return "Off";
    if (mode === "APPLY_LINK") return "Link to /apply";
    if (mode === "EMBED") {
        const p = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "External";
        return `Embed · ${p}`;
    }
    return String(mode);
}

function SettingsRow({
    icon,
    label,
    summary,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    summary: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left flex items-center gap-3 px-6 py-4 border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer transition-colors"
        >
            <div className="shrink-0">{icon}</div>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{label}</p>
                <p className="text-sm text-zinc-700 mt-0.5 truncate">{summary}</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300 shrink-0">
                <polyline points="9 18 15 12 9 6" />
            </svg>
        </button>
    );
}
