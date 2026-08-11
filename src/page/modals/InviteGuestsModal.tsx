"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getEventManagementConfig } from "../../config";
// attendees-action primitives now live in @cobuntu/event-management-ui;
// InlineEmailPreview stays admin-only (it talks to community customize
// deep-links — only admin has the editor target).
import {
    AttendeesActionModalShell,
    SmartRecipientInput,
    type SmartRecipientInputMember as Member,
    PrefillSuggestionsRow,
    RecipientChip,
    InlinePersonalizeEditor,
    type Recipient,
    recipientKey,
    PostSendCelebration,
} from "@cobuntu/event-management-ui";
import { InlineEmailPreview } from "./attendees-action/InlineEmailPreview";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Props {
    event: any;
    communityTag: string;
    eventId: string;
    showToast: (msg: string) => void;
    onClose: () => void;
}

/**
 * Send event invitations.
 *
 * Thin wrapper around the attendees-action/ primitives. The "Invite"
 * intent: send personalized invitation emails. Each invitation creates
 * an `event_invitations` row + dispatches an email via the standard
 * notification pipeline. Recipients click the link and either accept
 * directly (free events) or land on the event detail page with the
 * inviteToken threaded through to checkout (paid events — see
 * feat/invitations-route-paid-events-to-checkout).
 *
 * Differs from AddAttendeesModal:
 *   1. Per-recipient "Personalize" affordance via row expansion (drops
 *      the legacy full-window compose step entirely).
 *   2. Live email preview drawer (renders against the community's
 *      customized `event` template via the existing BE template
 *      resolver).
 *   3. Post-send celebration streams delivery status for 60s.
 *
 * Backwards-compat: existing call site preserved verbatim.
 */
export function InviteGuestsModal({ event, communityTag, eventId, showToast, onClose }: Props) {
    const [members, setMembers] = useState<Member[]>([]);
    const [staged, setStaged] = useState<Recipient[]>([]);
    const [sharedMessage, setSharedMessage] = useState("");
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    // Note: the legacy `previewOpen` drawer state is gone — the preview
    // is now always-visible inline (see InlineEmailPreview below).
    const [sendResult, setSendResult] = useState<
        | { count: number; deliveries: { email: string; name: string; status: "queued" | "delivered" | "opened" | "bounced" | "failed" }[] }
        | null
    >(null);
    const csvInputRef = useRef<HTMLInputElement>(null);

    const stagedKeys = useMemo(() => new Set(staged.map(recipientKey)), [staged]);
    const isPast = event?.endDate ? new Date(event.endDate) < new Date() : false;

    const authHeaders = (): Record<string, string> => {
        return getEventManagementConfig().authHeaders();
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Members + pre-existing invitations in parallel — the
                // state badges on autocomplete rows ("Already invited")
                // depend on the invitations response.
                const [mRes, iRes] = await Promise.all([
                    fetch(`${API}/api/communities/${communityTag}/memberships/admin`, { headers: authHeaders() }),
                    fetch(`${API}/api/communities/${communityTag}/events/${eventId}/invitations?limit=500`, { headers: authHeaders() }),
                ]);
                if (cancelled) return;
                const mData = mRes.ok ? await mRes.json() : { members: [] };
                const iData = iRes.ok ? await iRes.json() : { invitations: [] };
                const ms: any[] = mData?.members || mData || [];
                const invitations: any[] = iData?.invitations || iData || [];
                const invitedEmails = new Set<string>(
                    invitations
                        .filter((i) => (i?.status || "PENDING") === "PENDING")
                        .map((i) => (i?.email || "").toLowerCase())
                        .filter(Boolean),
                );
                const attendingUsertags = new Set<string>(
                    (event?.attendees || [])
                        .filter((a: any) => (a?.status || "APPROVED") === "APPROVED")
                        .map((a: any) => a?.user?.usertag || a?.usertag)
                        .filter(Boolean),
                );
                const enriched: Member[] = ms.map((m) => {
                    const lower = (m.email || "").toLowerCase();
                    const state: Member["state"] = attendingUsertags.has(m.usertag)
                        ? "attending"
                        : (lower && invitedEmails.has(lower))
                            ? "invited"
                            : "available";
                    return {
                        usertag: m.usertag,
                        name: m.name || m.usertag || "Unknown",
                        email: m.email ?? null,
                        profileImage: m.profileImage ?? null,
                        role: m.role,
                        state,
                    };
                });
                setMembers(enriched);
            } catch { /* silent */ }
        })();
        return () => { cancelled = true; };
    }, [communityTag, eventId, event?.attendees]);

    function addRecipients(rs: Recipient[]) {
        setStaged((prev) => {
            const have = new Set(prev.map(recipientKey));
            const next = [...prev];
            for (const r of rs) {
                const k = recipientKey(r);
                if (!have.has(k)) { next.push(r); have.add(k); }
            }
            return next;
        });
    }

    function removeRecipient(key: string) {
        setStaged((prev) => prev.filter((r) => recipientKey(r) !== key));
        if (editingKey === key) setEditingKey(null);
    }

    function setPersonalized(key: string, msg: string | undefined) {
        setStaged((prev) =>
            prev.map((r) =>
                recipientKey(r) === key
                    ? ({ ...r, personalizedMessage: msg && msg.trim() ? msg.trim() : undefined } as Recipient)
                    : r,
            ),
        );
    }

    async function handleSend() {
        // The BE accepts:
        //   usertags?: string[]
        //   emails?: string[]
        //   customMessage?: string  (legacy single-message field)
        //   perRecipientMessages?: { usertag?: string; email?: string; message: string }[]
        //
        // We pass both: shared as customMessage; personalizations as the
        // override array. The BE picks the override when present, falls
        // back to customMessage. (See InvitationService.sendInvitations.)
        const usertags = staged
            .filter((r) => r.kind === "member")
            .map((r) => (r as Extract<Recipient, { kind: "member" }>).usertag);
        const emails = staged
            .filter((r) => r.kind === "email" && r.state !== "invalid_email")
            .map((r) => (r as Extract<Recipient, { kind: "email" }>).email);
        if (usertags.length === 0 && emails.length === 0) return;
        const overrides = staged
            .filter((r) => r.personalizedMessage && r.personalizedMessage.trim())
            .map((r) =>
                r.kind === "member"
                    ? { usertag: r.usertag, message: r.personalizedMessage }
                    : { email: r.email, message: r.personalizedMessage },
            );
        setIsSending(true);
        try {
            const res = await fetch(`${API}/api/communities/${communityTag}/events/${eventId}/invitations`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    usertags: usertags.length > 0 ? usertags : undefined,
                    emails: emails.length > 0 ? emails : undefined,
                    customMessage: sharedMessage.trim() || undefined,
                    perRecipientMessages: overrides.length > 0 ? overrides : undefined,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                showToast(data?.error || "Failed to send invitations");
                return;
            }
            const data = await res.json().catch(() => ({}));
            const count = typeof data?.success === "number" ? data.success : usertags.length + emails.length;

            // Seed the delivery list as "queued"; PostSendCelebration's
            // polling loop will upgrade statuses from Resend webhook
            // events over the next 60s.
            const deliveries = staged
                .filter((r) => r.state !== "invalid_email")
                .map((r) => ({
                    email: r.kind === "member" ? (r.email || `@${r.usertag}`) : r.email,
                    name: r.kind === "member" ? r.name : r.email,
                    status: "queued" as const,
                }));
            setSendResult({ count, deliveries });
        } catch {
            showToast("Failed to send invitations");
        } finally {
            setIsSending(false);
        }
    }

    async function handleCsvUpload(file: File) {
        try {
            const text = await file.text();
            const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
            const cells = rows.map((r) => r.split(",")[0]?.trim() || "").filter(Boolean);
            const next: Recipient[] = cells.map((c) => ({ kind: "email" as const, email: c, state: "available" }));
            addRecipients(next);
            showToast(`Imported ${next.length} row${next.length === 1 ? "" : "s"} from CSV`);
        } catch {
            showToast("Failed to read CSV");
        }
    }

    const totalValid = staged.filter((r) => r.state !== "invalid_email" && r.state !== "attending").length;
    const previewRecipientName = staged.find((r) => r.kind === "member")?.kind === "member"
        ? (staged.find((r) => r.kind === "member") as Extract<Recipient, { kind: "member" }>).name
        : "Sarah";
    // Note: legacy `inviterName` + `inviterAvatarUrl` were used by the
    // dropped EmailPreviewDrawer. The InlineEmailPreview renders against
    // the BE preview endpoint which derives inviter from event_hosts
    // server-side.

    if (sendResult) {
        return (
            <AttendeesActionModalShell
                isOpen
                onClose={onClose}
                title="Done"
                subtitle={`${sendResult.count} invitation${sendResult.count === 1 ? "" : "s"} sent for ${event?.name || "this event"}.`}
                footer={
                    <div className="flex items-center justify-between gap-3">
                        <button
                            onClick={() => { setSendResult(null); setStaged([]); setSharedMessage(""); }}
                            className="px-4 py-2.5 text-[13px] text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer"
                        >
                            Send more
                        </button>
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                        >
                            Done
                        </button>
                    </div>
                }
            >
                <PostSendCelebration
                    mode="invite"
                    successCount={sendResult.count}
                    initialDeliveries={sendResult.deliveries}
                    communityTag={communityTag}
                    eventId={eventId}
                    authHeaders={authHeaders}
                    apiBaseUrl={API}
                />
            </AttendeesActionModalShell>
        );
    }

    return (
        <>
            <AttendeesActionModalShell
                isOpen
                onClose={onClose}
                unsavedCount={staged.length}
                title="Invite to event"
                subtitle={`Send invitations to join ${event?.name || "this event"}.`}
                footer={
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[13px] text-zinc-500 hidden sm:inline">
                            {totalValid > 0 ? `${totalValid} ready` : "Add at least one recipient"}
                        </span>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button
                                onClick={onClose}
                                className="hidden sm:inline-flex px-4 py-2.5 text-[13px] text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={isSending || totalValid === 0 || isPast}
                                className="flex-1 sm:flex-none px-5 py-2.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                                {isSending ? "Sending…" : `Send ${totalValid} invitation${totalValid === 1 ? "" : "s"}`}
                            </button>
                        </div>
                    </div>
                }
            >
                <div className="px-5 sm:px-6 py-5 space-y-5">
                    {isPast && (
                        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-[13px] text-amber-800">
                            This event has ended. Invitations can no longer be sent.
                        </div>
                    )}

                    <PrefillSuggestionsRow
                        communityTag={communityTag}
                        eventId={eventId}
                        stagedKeys={stagedKeys}
                        authHeaders={authHeaders}
                        apiBaseUrl={API}
                        onAddMember={(m) => addRecipients([{
                            kind: "member",
                            usertag: m.usertag,
                            name: m.name,
                            email: m.email ?? null,
                            profileImage: m.profileImage ?? null,
                            state: (m.state ?? "available") as "available" | "attending" | "invited" | "cancelled",
                        }])}
                    />

                    <SmartRecipientInput
                        allMembers={members}
                        stagedKeys={stagedKeys}
                        mode="invite"
                        onAdd={addRecipients}
                        onOpenCsvImport={() => csvInputRef.current?.click()}
                    />

                    <input
                        ref={csvInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleCsvUpload(f);
                            e.currentTarget.value = "";
                        }}
                    />

                    {/* Shared default message */}
                    <div>
                        <label className="text-[12px] font-medium text-zinc-700 mb-1.5 block">Default message</label>
                        <textarea
                            value={sharedMessage}
                            onChange={(e) => setSharedMessage(e.target.value.slice(0, 500))}
                            placeholder="Add a personal note (sent to everyone you invite — unless you personalize per-recipient below)."
                            rows={3}
                            className="w-full px-3 py-2.5 text-sm text-zinc-900 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400 resize-none placeholder:text-zinc-400"
                        />
                        <p className="text-[11px] text-zinc-400 text-right mt-1">{sharedMessage.length}/500</p>
                    </div>

                    {/* Always-visible email preview. Renders against the
                        community's actual customized event template (falls
                        back to platform default). Includes a "Customize
                        template →" deep-link into /customize → Emails for
                        leaders who want to change branding without leaving
                        the modal context. */}
                    <InlineEmailPreview
                        communityTag={communityTag}
                        eventId={eventId}
                        customMessage={sharedMessage}
                        recipientName={previewRecipientName}
                        authHeaders={authHeaders}
                        apiBaseUrl={API}
                        canCustomize={true}
                    />


                    {/* Selected chip strip with inline personalize */}
                    {staged.length > 0 && (
                        <div>
                            <div className="flex items-baseline justify-between mb-2">
                                <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Selected ({staged.length})</p>
                                <button onClick={() => setStaged([])} className="text-[11px] text-zinc-500 hover:text-red-500 cursor-pointer">Clear all</button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {staged.map((r) => {
                                    const k = recipientKey(r);
                                    if (editingKey === k) {
                                        return (
                                            <div key={k} className="w-full">
                                                <InlinePersonalizeEditor
                                                    recipientName={r.kind === "member" ? r.name : r.email}
                                                    initial={r.personalizedMessage || sharedMessage}
                                                    onSave={(msg) => { setPersonalized(k, msg || undefined); setEditingKey(null); }}
                                                    onCancel={() => setEditingKey(null)}
                                                />
                                            </div>
                                        );
                                    }
                                    return (
                                        <RecipientChip
                                            key={k}
                                            recipient={r}
                                            allowPersonalize
                                            onTogglePersonalize={() => setEditingKey(k)}
                                            onRemove={() => removeRecipient(k)}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </AttendeesActionModalShell>

        </>
    );
}
