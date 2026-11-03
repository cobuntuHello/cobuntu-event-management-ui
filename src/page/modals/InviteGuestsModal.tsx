"use client";

import { useRef, useState } from "react";
import { getEventManagementConfig } from "../../config";
import { useEventT } from "../../create-wizard/i18n";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";
import {
    PersonPickerModal, recipientsToApi, perRecipientMessages, type Recipient,
} from "@cobuntu/management-ui-shared";
import { AttendeesActionModalShell, PostSendCelebration } from "@cobuntu/event-management-ui";
// InlineEmailPreview stays here rather than in the shared package: it
// deep-links into the community's email editor, and only admin has that target.
import { InlineEmailPreview } from "./attendees-action/InlineEmailPreview";
import { useGuestSuggestions } from "./useGuestSuggestions";
import { apiBase } from "../helpers";

interface Props {
    event: any;
    communityTag: string;
    eventId: string;
    /** Kept for call-site compatibility. Failures now surface inside the
        picker, which keeps the staged list rather than closing over it. */
    showToast?: (msg: string) => void;
    onClose: () => void;
}

/**
 * Send event invitations.
 *
 * Each invitation writes an `event_invitations` row and dispatches an email.
 * Recipients click the link and either accept directly (free events) or land on
 * the event page with the inviteToken threaded through to checkout (paid).
 *
 * ── What changed, and why it looks different ────────────────────────────────
 *
 * This was a single long screen built from five local primitives. It is now the
 * EVENTS HALF of the shared PersonPickerModal: the endpoint, the words, and the
 * email preview. Choosing people is the same component that serves adding
 * attendees, hosts, co-sellers and product access grants, so the four flows
 * finally feel like one feature rather than four takes on it.
 *
 * Nothing was dropped in the move. CSV import, the suggestion chips and the
 * per-recipient personalisation all went INTO the shared picker first, which is
 * why this file is a third of its old size.
 *
 * ── Two kinds of note ───────────────────────────────────────────────────────
 *
 * The shared note goes to everyone and drives the live preview. A per-recipient
 * note replaces it for that one person. The server reads both: `customMessage`
 * is the fallback, `perRecipientMessages` the override.
 *
 * Talks to:
 *   POST /api/communities/:tag/events/:id/invitations
 *        { usertags, emails, customMessage, perRecipientMessages }
 */
export function InviteGuestsModal({ event, communityTag, eventId, onClose }: Props) {
    const [sent, setSent] = useState<
        | { count: number; deliveries: { email: string; name: string; status: "queued" }[] }
        | null
    >(null);
    /*
     * The picker closes itself once onConfirm resolves. We want the delivery
     * screen instead, and the `sent` state that hides the picker has not
     * re-rendered at that point — so the decision is read from a ref, which is
     * written synchronously inside onConfirm.
     */
    const finished = useRef(false);
    const tx = useEventT("eventsUi.manageUi.inviteGuestsModal");

    const config = getEventManagementConfig();
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;
    const authHeaders = (): Record<string, string> => getEventManagementConfig().authHeaders();

    const isPast = event?.endDate ? new Date(event.endDate) < new Date() : false;

    const suggestions = useGuestSuggestions({
        apiBaseUrl: apiBase(), communityTag, eventId, authHeaders,
        enabled: sent === null && !isPast,
    });

    /* Already going, so not worth inviting again. */
    const attendingUserIds: string[] = (event?.attendees || [])
        .filter((a: any) => (a?.status || "APPROVED") === "APPROVED")
        .map((a: any) => a?.user?.id || a?.userId)
        .filter(Boolean);

    async function invite(recipients: Recipient[], shared: string | null) {
        if (isPast) throw new Error(tx("errEnded"));
        const { usertags, emails } = recipientsToApi(recipients);
        if (usertags.length === 0 && emails.length === 0) {
            throw new Error(tx("errChoose"));
        }
        const overrides = perRecipientMessages(recipients);

        const res = await fetch(
            `${apiBase()}/api/communities/${communityTag}/events/${eventId}/invitations`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    usertags: usertags.length > 0 ? usertags : undefined,
                    emails: emails.length > 0 ? emails : undefined,
                    customMessage: shared || undefined,
                    perRecipientMessages: overrides.length > 0 ? overrides : undefined,
                }),
            },
        );
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.error || tx("errSendFailed"));
        }
        const data = await res.json().catch(() => ({}));

        /* Seeded as "queued". The celebration's polling loop upgrades each one
           from Resend webhook events over the next 60 seconds. */
        finished.current = true;
        setSent({
            count: typeof data?.success === "number" ? data.success : usertags.length + emails.length,
            deliveries: recipients.map((r) => ({
                email: r.email || (r.usertag ? `@${r.usertag}` : ""),
                name: r.name || r.email || tx("unknown"),
                status: "queued" as const,
            })),
        });
    }

    if (sent) {
        return (
            <AttendeesActionModalShell
                isOpen
                onClose={onClose}
                title={tx("doneTitle")}
                subtitle={tx("doneSubtitle", { count: sent.count, event: event?.name || tx("thisEvent") })}
                footer={
                    <div className="flex items-center justify-between gap-3">
                        <button
                            onClick={() => { finished.current = false; setSent(null); }}
                            className="px-4 py-2.5 text-[13px] rounded-lg cursor-pointer bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                        >
                            {tx("sendMore")}
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
                    mode="invite"
                    successCount={sent.count}
                    initialDeliveries={sent.deliveries}
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
                searchSubtitle: tx("searchSubtitle", { event: event?.name || tx("thisEvent") }),
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
                perRecipient: {
                    personalize: tx("personalize"),
                    personalized: tx("personalized"),
                    save: tx("save"),
                    cancel: tx("discard"),
                    placeholder: (name) => tx("perRecipientPlaceholder", { name }),
                },
                /* Renders the community's own customized event template, so
                   what is on screen is what will be received. */
                preview: (message) => (
                    <>
                        {isPast && (
                            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 mb-3 text-[13px] text-amber-800">
                                {tx("errEnded")}
                            </div>
                        )}
                        <InlineEmailPreview
                            communityTag={communityTag}
                            eventId={eventId}
                            customMessage={message}
                            recipientName="Sarah"
                            authHeaders={authHeaders}
                            apiBaseUrl={apiBase()}
                            canCustomize={true}
                        />
                    </>
                ),
            }}
            onConfirm={invite}
        />
    );
}
