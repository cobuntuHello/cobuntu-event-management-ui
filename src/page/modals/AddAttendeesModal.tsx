"use client";

import { useRef, useState } from "react";
import { getEventManagementConfig } from "../../config";
import { useEventT } from "../../create-wizard/i18n";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import {
    PersonPickerModal, recipientsToApi, type Recipient, type PersonPickerTierStep,
} from "@cobuntu/management-ui-shared";
import { AttendeesActionModalShell, PostSendCelebration } from "@cobuntu/event-management-ui";
import { useGuestSuggestions } from "./useGuestSuggestions";
import { apiBase } from "../helpers";

interface Props {
    event: any;
    communityTag: string;
    eventId: string;
    /** Kept for call-site compatibility. Failures now surface inside the
        picker, which keeps the staged list rather than closing over it. */
    showToast?: (msg: string) => void;
    onUpdate: () => void;
    onClose: () => void;
    onSwitchToInvite?: () => void;
}

/**
 * Add attendees directly. No invitation email, no payment.
 *
 * Hosts use this to register people who cannot sign up themselves: known
 * guests, staff, comps. The result is APPROVED `event_attendances` rows.
 *
 * ── What changed, and why it looks different ────────────────────────────────
 *
 * This was a single long screen built from five local primitives. It is now the
 * EVENTS HALF of the shared PersonPickerModal: the endpoint, the words, and the
 * two warnings that only apply to events. Everything about choosing people —
 * the roster, the search, the suggestion chips, typed addresses, CSV import,
 * the staged strip — is the component that also serves invitations, hosts,
 * co-sellers and access grants. Four flows that were four implementations.
 *
 * The operator gains the community's members on screen when it opens, grouped
 * by role, instead of an empty box. Nothing was dropped: CSV import and
 * suggestions moved into the shared picker rather than away.
 *
 * ── The internal note is compose, not consequences ──────────────────────────
 *
 * Step two needs a textarea AND the "what this does" box, which is exactly what
 * `compose` renders — a note plus whatever the caller puts under it. That the
 * note is never sent is the caller's business, and the words say so plainly.
 *
 * Talks to:
 *   POST /api/communities/:tag/events/:id/add-attendees { usertags, emails, internalNote }
 */
export function AddAttendeesModal({
    event,
    communityTag,
    eventId,
    onUpdate,
    onClose,
    onSwitchToInvite,
}: Props) {
    const [added, setAdded] = useState<number | null>(null);
    /*
     * The picker closes itself once onConfirm resolves. We want the celebration
     * instead, and the `added` state that hides the picker has not re-rendered
     * yet at that point — so the decision is read from a ref, which is written
     * synchronously inside onConfirm.
     */
    const finished = useRef(false);
    const tx = useEventT("eventsUi.manageUi.addAttendeesModal");

    const config = getEventManagementConfig();
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;
    const authHeaders = (): Record<string, string> => getEventManagementConfig().authHeaders();

    const isPast = event?.endDate ? new Date(event.endDate) < new Date() : false;
    const tierFormsCount = (event?.tiers || []).filter(
        (t: any) => (t?.tier_forms && t.tier_forms.length > 0) || t?.formId,
    ).length;

    /*
     * Which ticket the added people get.
     *
     * ── Why this is feature-detected ────────────────────────────────────────
     *
     * Per-tier occupancy (`soldOut`, `remaining`) only reaches this payload
     * once the tier-bound-capacity backend is deployed. Rendering the step
     * without it would mean showing availability we do not actually know —
     * and presenting an unknown as "unlimited" is precisely the mistake that
     * made the public API report every tier available forever.
     *
     * So the step appears when the numbers do. Until then the modal behaves
     * exactly as it does today, and the server still assigns the default tier.
     */
    const tiers: any[] = event?.tiers || [];
    const hasOccupancy = tiers.length > 0 && tiers.every((t) => typeof t?.soldOut === "boolean");

    const tierStep: PersonPickerTierStep | undefined = hasOccupancy ? {
        tiers: tiers.map((t) => ({
            id: t.id,
            name: t.name,
            remaining: typeof t.remaining === "number" ? t.remaining : null,
            soldOut: t.soldOut === true,
        })),
        copy: {
            stepLabel: tx("tierStepLabel"),
            subtitle: tx("tierSubtitle"),
            remaining: (n) => tx("tierRemaining", { count: n }),
            unlimited: tx("tierUnlimited"),
            soldOut: tx("tierSoldOut"),
            allFull: tx("tierAllFull"),
            summary: (n, name) => tx("tierSummary", { count: n, name }),
            overBy: (n, name) => tx("tierOverBy", { count: n, name }),
            importPreviewTitle: tx("importPreviewTitle"),
            importReady: (n) => tx("importReady", { count: n }),
            importProblems: (n) => tx("importProblems", { count: n }),
            problemUnknownTier: (name) => tx("problemUnknownTier", { name }),
            problemNoTier: tx("problemNoTier"),
            problemTierFull: tx("problemTierFull"),
            importConfirm: tx("importConfirm"),
            importCancel: tx("importCancel"),
        },
    } : undefined;

    const suggestions = useGuestSuggestions({
        apiBaseUrl: apiBase(), communityTag, eventId, authHeaders,
        enabled: added === null && !isPast,
    });

    /* Already in, so not offerable again. The picker filters them out of the
       roster, the search and the suggestion chips in one pass. */
    const attendingUserIds: string[] = (event?.attendees || [])
        .filter((a: any) => (a?.status || "APPROVED") === "APPROVED")
        .map((a: any) => a?.user?.id || a?.userId)
        .filter(Boolean);

    async function addAttendees(recipients: Recipient[], note: string | null) {
        /* The old modal disabled its own submit button for this. The picker's
           confirm is always live, so the rule lives here — where the server
           enforces it too, rather than only in a disabled attribute. */
        if (isPast) throw new Error(tx("errEnded"));
        const { usertags, emails } = recipientsToApi(recipients);
        if (usertags.length === 0 && emails.length === 0) {
            throw new Error(tx("errChoose"));
        }
        /*
         * One entry per person, because an imported list can mix tickets. The
         * server validates every id belongs to this event and refuses the
         * whole call if one does not — a stale ticket id quietly seating ten
         * people in General Admission is not a mistake anybody would trace.
         */
        const tierAssignments = recipients
            .filter((r) => r.tierId)
            .map((r) => ({ usertag: r.usertag ?? null, email: r.email ?? null, tierId: r.tierId! }));
        const res = await fetch(
            `${apiBase()}/api/communities/${communityTag}/events/${eventId}/add-attendees`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    usertags: usertags.length > 0 ? usertags : undefined,
                    emails: emails.length > 0 ? emails : undefined,
                    internalNote: note || undefined,
                    tierAssignments: tierAssignments.length > 0 ? tierAssignments : undefined,
                }),
            },
        );
        if (!res.ok) {
            /* Thrown, not toasted: the picker keeps the staged list and shows
               the reason, so a failure does not cost a CSV import. */
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.error || tx("errAddFailed"));
        }
        const data = await res.json().catch(() => ({}));
        finished.current = true;
        setAdded(typeof data?.added === "number" ? data.added : usertags.length + emails.length);
        onUpdate();
    }

    if (added !== null) {
        return (
            <AttendeesActionModalShell
                isOpen
                onClose={onClose}
                title={tx("doneTitle")}
                subtitle={tx("doneSubtitle", { count: added, event: event?.name || tx("thisEvent") })}
                footer={
                    <div className="flex items-center justify-between gap-3">
                        <button
                            onClick={() => { finished.current = false; setAdded(null); }}
                            className="px-4 py-2.5 text-[13px] rounded-lg cursor-pointer bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                        >
                            {tx("addMore")}
                        </button>
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                        >
                            {tx("done")}
                        </button>
                    </div>
                }
            >
                <PostSendCelebration
                    mode="add"
                    successCount={added}
                    communityTag={communityTag}
                    eventId={eventId}
                    authHeaders={authHeaders}
                    apiBaseUrl={apiBase()}
                />
            </AttendeesActionModalShell>
        );
    }

    return (
        <PersonPickerModal
            open
            onClose={() => { if (!finished.current) onClose(); }}
            apiBaseUrl={apiBase()}
            authHeaders={authHeaders}
            communityTag={communityTag}
            excludeUserIds={attendingUserIds}
            UserAvatar={UserAvatar}
            multiple
            tierStep={tierStep}
            suggestions={suggestions}
            emails={{
                addRow: (a) => tx("addRow", { address: a }),
                importCsv: tx("importCsv"),
                imported: (n) => tx("imported", { count: n }),
                importedNothing: tx("importedNothing"),
                importFailed: tx("importFailed"),
            }}
            copy={{
                title: tx("title"),
                searchSubtitle: tx("searchSubtitle"),
                pickedSubtitle: tx("pickedSubtitle"),
                searchPlaceholder: tx("searchPlaceholder"),
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
                selectedLabel: (n) => tx("selectedLabel", { count: n }),
                selectedTitle: tx("selectedTitle"),
                clearAll: tx("clearAll"),
                remove: (name) => tx("remove", { name }),
                messageLabel: tx("messageLabel"),
                messagePlaceholder: tx("messagePlaceholder"),
                discardConfirm: tx("discardConfirm"),
            }}
            stepTwo={{
                kind: "compose",
                maxLength: 500,
                /* Not an email preview: nothing is sent. The space under the
                   note is where the consequences of adding directly belong,
                   including the two warnings that are specific to this event. */
                preview: () => (
                    <div className="space-y-3">
                        {isPast && (
                            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-[13px] text-amber-800">
                                {tx("errEnded")}
                            </div>
                        )}
                        {tierFormsCount > 0 && !isPast && (
                            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                                <p className="text-[13px] text-amber-900 font-medium mb-1">
                                    {tx("skipFormTitle")}
                                </p>
                                <p className="text-[12px] text-amber-800 leading-snug">
                                    {tierFormsCount === 1
                                        ? tx("hasForm")
                                        : tx("hasForms", { count: tierFormsCount })}{" "}
                                    {tx("answersEmpty")}{" "}
                                    {onSwitchToInvite && (
                                        <button
                                            onClick={() => { onClose(); onSwitchToInvite(); }}
                                            className="text-amber-900 font-medium underline hover:no-underline cursor-pointer"
                                        >
                                            {tx("inviteInstead")}
                                        </button>
                                    )}
                                </p>
                            </div>
                        )}
                        <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-3 text-[12px] text-zinc-600 leading-relaxed">
                            <p className="font-medium text-zinc-800 mb-1">{tx("whatNext")}</p>
                            <ul className="space-y-1 list-disc list-inside [&>li]:pl-0">
                                <li>{tx("next1")}</li>
                                <li>{tx("next2")}</li>
                                <li>{tx("next3")}</li>
                            </ul>
                        </div>
                    </div>
                ),
            }}
            onConfirm={addAttendees}
        />
    );
}
