"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useEventManagementConfig } from "../config";
import { tierAccessSummary, toTierAccessValue, fetchMembershipTiers } from "@cobuntu/management-ui-shared";
import { ViewabilityEditModal } from "./ViewabilityEditModal";
import { AccessibilityEditModal } from "./AccessibilityEditModal";
import { DistributionEditModal } from "./DistributionEditModal";
import { AfterCheckoutEditModal } from "./AfterCheckoutEditModal";
import { ApprovalEditModal } from "./ApprovalEditModal";
import { RefundPolicyEditModal, refundPolicySummary } from "./RefundPolicyEditModal";

/**
 * Settings drawer for the event-management Overview tab.
 *
 * Holds the host-config settings that aren't core event metadata
 * (name/date/location/pricing). Each row opens a standalone modal:
 *
 *   - Visibility    (events.viewability — who can SEE)
 *   - Access        (events.accessibility — who can RSVP)
 *   - Distribution  (NATIVE/EXTERNAL landing + Featured)
 *   - Refund policy (per-event refund window override)
 *
 * (Membership-funnel row was removed alongside the BE module kill
 * in cobuntu-backend-monorepo PR #671. The feature will be rebuilt
 * as pure-FE later — Workstream 1 in the events-domain roadmap.)
 *
 * Same interaction pattern as the legacy EditEventDrawer's sub-modal
 * flow: clicking a row visually closes the drawer + opens the modal;
 * closing the modal re-opens the drawer with the updated state. The
 * drawer doesn't own form state — each modal PUTs to the API itself
 * and calls onSaved() to trigger the parent's reload.
 */

type ModalKey = "viewability" | "accessibility" | "distribution" | "after-checkout" | "refund-policy" | "approval" | null;

interface Props {
    event: any;
    communityTag: string;
    isOpen: boolean;
    /**
     * When true, surfaces a one-line note at the top of the drawer that
     * Access / Featured no longer change anything for buyers because
     * the event has ended. Settings stay editable (Visibility +
     * Distribution detailSource still have legitimate post-event use).
     * Defaults to false for backwards compatibility.
     */
    isPast?: boolean;
    /**
     * Drops the "After checkout" row (post-purchase membership upsell /
     * external redirect). That config is a community-LEADER capability: the
     * backend requires the event to be community-owned AND the caller to hold
     * EVENTS_CREATE, so a member who created their own event, a plain host, and
     * a personal (non-community) event all get a 403 on save.
     *
     * Without this, the row rendered for everyone with manage access and a
     * member host hit a dead-end error. Mirrors EventForm's `hideVisibility`.
     * Consumers pass `!(event.communityId && hasPermission(EVENTS_CREATE))`.
     * Defaults to false so the admin (leaders only) needs no change.
     *
     * This is an affordance, not the guard — the route re-enforces it.
     */
    hideAfterCheckout?: boolean;
    /**
     * The community's membership tiers, for the access pickers. Empty renders
     * "no membership tiers yet" rather than an empty rail.
     */
    membershipTiers?: { id: string; name: string }[];
    /** Tier ids currently granted each axis, from the listing. */
    viewTierIds?: string[];
    buyTierIds?: string[];
    onClose: () => void;
    onSaved: () => void;
    showToast: (msg: string) => void;
}

export function SettingsDrawer({
    event,
    communityTag,
    isOpen,
    isPast,
    hideAfterCheckout,
    membershipTiers: membershipTiersProp,
    viewTierIds,
    buyTierIds,
    onClose,
    onSaved,
    showToast,
}: Props) {
    /*
     * ── The drawer loads its own tiers ──────────────────────────────
     *
     * It accepted a `membershipTiers` prop, OverviewView never passed one, and
     * EventManagePage did not have the prop at all - so the chain was severed
     * inside this package and no consumer could repair it from outside. Every
     * access picker on a manage page said "This community has no membership
     * tiers yet" for communities with several.
     *
     * Fetching here fixes both apps at once and keeps the prop as an override
     * for anyone who already has the list.
     */
    const [fetchedTiers, setFetchedTiers] = useState<{ id: string; name: string }[]>([]);
    const { apiBaseUrl } = useEventManagementConfig();
    useEffect(() => {
        if (membershipTiersProp || !isOpen || !communityTag) return;
        let cancelled = false;
        fetchMembershipTiers(apiBaseUrl, communityTag).then((t) => {
            if (!cancelled) setFetchedTiers(t);
        });
        return () => { cancelled = true; };
    }, [membershipTiersProp, isOpen, communityTag, apiBaseUrl]);
    const membershipTiers = membershipTiersProp ?? fetchedTiers;

    /*
     * Which rows this drawer may show.
     *
     * Four of these settings are statements about a COMMUNITY — who among its
     * members may see or buy this, where its storefront sends people, what it
     * promotes after a sale — and the backend refuses them outright on a
     * user-owned listing (COMMUNITY_SCOPED_EVENT_FIELDS, 403). A personal
     * event has no membership to gate against and no storefront to redirect.
     *
     * Approval and the refund policy are the HOST's own calls. The backend
     * leaves both out of that list, so a personal event's owner may set them
     * exactly like a leader may.
     *
     * The whole button used to be hidden on a user-owned event, which is how
     * those two became unreachable — a member selling their own event could
     * not state a refund policy at all, and approval was settable once in the
     * create form and never again. Scope the ROWS, keep the entry point.
     */
    const isCommunityOwned = !!event?.communityId;
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

    /*
     * ─── Active sub-modal (mutually exclusive with the drawer) ──────
     *
     * Each editor is gated identically to the row that opens it, so a stale
     * `modal` state can't surface an editor to someone the backend would 403.
     */
    if (modal === "viewability" && isCommunityOwned) {
        return (
            <ViewabilityEditModal
                event={event}
                communityTag={communityTag}
                membershipTiers={membershipTiers}
                initialTierIds={viewTierIds}
                onClose={closeModalAndReopenDrawer}
                onSaved={modalSaved}
                showToast={showToast}
            />
        );
    }
    if (modal === "accessibility" && isCommunityOwned) {
        return (
            <AccessibilityEditModal
                event={event}
                communityTag={communityTag}
                membershipTiers={membershipTiers}
                initialTierIds={buyTierIds}
                // The ceiling: registering cannot be offered to people who
                // cannot see the event in the first place.
                viewTierIds={viewTierIds}
                onClose={closeModalAndReopenDrawer}
                onSaved={modalSaved}
                showToast={showToast}
            />
        );
    }
    if (modal === "distribution" && isCommunityOwned) {
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
    if (modal === "after-checkout" && !hideAfterCheckout) {
        return (
            <AfterCheckoutEditModal
                event={event}
                communityTag={communityTag}
                onClose={closeModalAndReopenDrawer}
                onSaved={modalSaved}
                showToast={showToast}
            />
        );
    }
    if (modal === "approval") {
        return (
            <ApprovalEditModal
                event={event}
                communityTag={communityTag}
                onClose={closeModalAndReopenDrawer}
                onSaved={modalSaved}
                showToast={showToast}
            />
        );
    }
    if (modal === "refund-policy") {
        return (
            <RefundPolicyEditModal
                event={event}
                communityTag={communityTag}
                onClose={closeModalAndReopenDrawer}
                onSaved={modalSaved}
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
                className={`fixed inset-0 z-[120] transition-opacity duration-300 ${
                    animating ? "bg-black/50" : "bg-black/0"
                }`}
                onClick={handleClose}
            />

            <div
                className={`fixed inset-y-0 right-0 z-[120] w-full max-w-lg bg-white shadow-2xl flex flex-col rounded-l-2xl overflow-hidden transition-transform duration-300 ease-out ${
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

                {/* Past-event note. Access / Featured can still be
                    toggled (idempotent on the BE) but they don't
                    affect anything once the event has ended; flag it
                    once at the drawer level rather than per-row. */}
                {isPast && (
                    <div className="px-5 py-2.5 bg-zinc-50 border-b border-zinc-100 shrink-0">
                        <p className="text-[11px] text-zinc-500 leading-snug">
                            Event has ended. Access and Featured no longer affect new registrations — only Visibility and a custom landing URL still apply.
                        </p>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Grouped, not just gated. These three are refused on a
                        user-owned event (COMMUNITY_SCOPED_EVENT_FIELDS, 403),
                        and hiding them unlabelled read as missing features
                        rather than one rule. Approval and Refund policy below
                        are the HOST's own and stay on both ownership kinds. */}
                    {isCommunityOwned && (
                        <p className="px-6 pt-4 pb-1 text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                            Community access
                        </p>
                    )}
                    {isCommunityOwned && (
                    <SettingsRow
                        label="Visibility"
                        summary={tierAccessSummary(toTierAccessValue(event.viewability ?? "PUBLIC", viewTierIds), membershipTiers)}
                        onClick={() => openModal("viewability")}
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        }
                    />
                    )}
                    {isCommunityOwned && (
                    <SettingsRow
                        label="Access"
                        summary={tierAccessSummary(toTierAccessValue(event.accessibility ?? "PUBLIC", buyTierIds), membershipTiers)}
                        onClick={() => openModal("accessibility")}
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                                <rect x="3" y="11" width="18" height="11" rx="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                        }
                    />
                    )}
                    {isCommunityOwned && (
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
                    )}
                    {!hideAfterCheckout && (
                        <SettingsRow
                            label="After checkout"
                            summary={
                                event.afterCheckoutMode === "MEMBERSHIP_UPSELL" ? "Membership upsell"
                                    : event.afterCheckoutMode === "EXTERNAL" ? "External redirect"
                                        : "Normal confirmation"
                            }
                            onClick={() => openModal("after-checkout")}
                            icon={
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                                    <path d="M9 11l3 3L22 4" />
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                </svg>
                            }
                        />
                    )}
                    <p className="px-6 pt-4 pb-1 text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                        Your settings
                    </p>
                    <SettingsRow
                        label="Approval"
                        summary={event.requiresApproval ? "You review each registration" : "Registrations confirm instantly"}
                        onClick={() => openModal("approval")}
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>
                        }
                    />
                    <SettingsRow
                        label="Refund policy"
                        summary={refundPolicySummary(event.refundPolicy)}
                        onClick={() => openModal("refund-policy")}
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                                <path d="M3 12a9 9 0 1 0 3.6-7.2" />
                                <polyline points="3 4 3 10 9 10" />
                            </svg>
                        }
                    />
                </div>
            </div>
        </>,
        document.body,
    );
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
