"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getEventManagementConfig } from "../../config";
// attendees-action primitives now live in @cobuntu/event-management-ui so
// admin + community-app + future surfaces share one implementation. The
// pkg-portable RecipientChip / SmartRecipientInput / PrefillSuggestionsRow
// render admin's UserAvatar via the package's config injection
// (lib/event-management-config.tsx).
import {
    AttendeesActionModalShell,
    SmartRecipientInput,
    type SmartRecipientInputMember as Member,
    PrefillSuggestionsRow,
    RecipientChip,
    type Recipient,
    recipientKey,
    PostSendCelebration,
} from "@cobuntu/event-management-ui";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Props {
    event: any;
    communityTag: string;
    eventId: string;
    showToast: (msg: string) => void;
    onUpdate: () => void;
    onClose: () => void;
    onSwitchToInvite?: () => void;
}

/**
 * Add attendees directly (no invitation email, no payment flow).
 *
 * Thin wrapper around the attendees-action/ primitives. The "Add"
 * intent: hosts manually register people who can't sign up themselves —
 * known guests, staff, comps. The result is APPROVED `event_attendances`
 * rows + (optionally) a fire-and-forget confirmation email so the new
 * attendee knows they're in.
 *
 * Differs from AttendeesInviteModal in three ways:
 *   1. No per-recipient personalize affordance (no outbound message
 *      to personalize; confirmation emails are system-templated).
 *   2. No email preview drawer.
 *   3. "Internal note" textarea, clearly labelled as not sent.
 *
 * Backwards-compat: the existing call site in AttendeesView passes
 *   <AddAttendeesModal event communityTag eventId showToast onUpdate onClose onSwitchToInvite />
 * — preserved verbatim so no consumer change is required.
 */
export function AddAttendeesModal({
    event,
    communityTag,
    eventId,
    showToast,
    onUpdate,
    onClose,
    onSwitchToInvite,
}: Props) {
    const [members, setMembers] = useState<Member[]>([]);
    const [staged, setStaged] = useState<Recipient[]>([]);
    const [internalNote, setInternalNote] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [sendResult, setSendResult] = useState<{ count: number } | null>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);

    const isPast = event?.endDate ? new Date(event.endDate) < new Date() : false;
    const tierFormsCount = (event?.tiers || []).filter(
        (t: any) => (t?.tier_forms && t.tier_forms.length > 0) || t?.formId,
    ).length;

    const stagedKeys = useMemo(() => new Set(staged.map(recipientKey)), [staged]);

    const authHeaders = (): Record<string, string> => {
        return getEventManagementConfig().authHeaders();
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(
                    `${API}/api/communities/${communityTag}/memberships/admin`,
                    { headers: authHeaders() },
                );
                if (!res.ok || cancelled) return;
                const data = await res.json();
                const ms: any[] = data?.members || data || [];
                const attendingUsertags = new Set<string>(
                    (event?.attendees || [])
                        .filter((a: any) => (a?.status || "APPROVED") === "APPROVED")
                        .map((a: any) => a?.user?.usertag || a?.usertag)
                        .filter(Boolean),
                );
                const enriched: Member[] = ms.map((m) => ({
                    usertag: m.usertag,
                    name: m.name || m.usertag || "Unknown",
                    email: m.email ?? null,
                    profileImage: m.profileImage ?? null,
                    role: m.role,
                    state: attendingUsertags.has(m.usertag) ? "attending" : "available",
                }));
                setMembers(enriched);
            } catch { /* silent */ }
        })();
        return () => { cancelled = true; };
    }, [communityTag, event?.attendees]);

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
    }

    async function handleAdd() {
        const usertags = staged
            .filter((r) => r.kind === "member")
            .map((r) => (r as Extract<Recipient, { kind: "member" }>).usertag);
        const emails = staged
            .filter((r) => r.kind === "email" && r.state !== "invalid_email")
            .map((r) => (r as Extract<Recipient, { kind: "email" }>).email);
        if (usertags.length === 0 && emails.length === 0) return;
        setIsAdding(true);
        try {
            const res = await fetch(
                `${API}/api/communities/${communityTag}/events/${eventId}/add-attendees`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders() },
                    body: JSON.stringify({
                        usertags: usertags.length > 0 ? usertags : undefined,
                        emails: emails.length > 0 ? emails : undefined,
                        internalNote: internalNote.trim() || undefined,
                    }),
                },
            );
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                showToast(data?.error || "Failed to add attendees");
                return;
            }
            const data = await res.json().catch(() => ({}));
            const count = typeof data?.added === "number" ? data.added : usertags.length + emails.length;
            setSendResult({ count });
            onUpdate();
        } catch {
            showToast("Failed to add attendees");
        } finally {
            setIsAdding(false);
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

    const totalValid = staged.filter((r) => r.state !== "invalid_email").length;

    if (sendResult) {
        return (
            <AttendeesActionModalShell
                isOpen
                onClose={onClose}
                title="Done"
                subtitle={`${sendResult.count} attendee${sendResult.count === 1 ? "" : "s"} added to ${event?.name || "this event"}.`}
                footer={
                    <div className="flex items-center justify-between gap-3">
                        <button
                            onClick={() => { setSendResult(null); setStaged([]); setInternalNote(""); }}
                            className="px-4 py-2.5 text-[13px] text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer"
                        >
                            Add more
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
                    mode="add"
                    successCount={sendResult.count}
                    communityTag={communityTag}
                    eventId={eventId}
                    authHeaders={authHeaders}
                    apiBaseUrl={API}
                />
            </AttendeesActionModalShell>
        );
    }

    return (
        <AttendeesActionModalShell
            isOpen
            onClose={onClose}
            unsavedCount={staged.length}
            title="Add attendees"
            subtitle="Manually register people who can't sign up themselves — no invitation email."
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
                            onClick={handleAdd}
                            disabled={isAdding || totalValid === 0 || isPast}
                            className="flex-1 sm:flex-none px-5 py-2.5 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {isAdding ? "Adding…" : `Add ${totalValid} attendee${totalValid === 1 ? "" : "s"}`}
                        </button>
                    </div>
                </div>
            }
        >
            <div className="px-5 sm:px-6 py-5 space-y-5">
                {isPast && (
                    <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-[13px] text-amber-800">
                        This event has ended. Attendees can no longer be added.
                    </div>
                )}

                {tierFormsCount > 0 && !isPast && (
                    <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                        <p className="text-[13px] text-amber-900 font-medium mb-1">Attendees added here skip the registration form</p>
                        <p className="text-[12px] text-amber-800 leading-snug">
                            {tierFormsCount === 1
                                ? "This event has a registration form."
                                : `This event has ${tierFormsCount} tiers with registration forms.`}{" "}
                            Their answers will be empty for everyone you add here.{" "}
                            {onSwitchToInvite && (
                                <button
                                    onClick={() => { onClose(); onSwitchToInvite(); }}
                                    className="text-amber-900 font-medium underline hover:no-underline cursor-pointer"
                                >
                                    Invite Guests instead →
                                </button>
                            )}
                        </p>
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
                    mode="add"
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

                {staged.length > 0 && (
                    <div>
                        <div className="flex items-baseline justify-between mb-2">
                            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Selected ({staged.length})</p>
                            <button onClick={() => setStaged([])} className="text-[11px] text-zinc-500 hover:text-red-500 cursor-pointer">Clear all</button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {staged.map((r) => (
                                <RecipientChip
                                    key={recipientKey(r)}
                                    recipient={r}
                                    onRemove={() => removeRecipient(recipientKey(r))}
                                />
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <label className="text-[12px] font-medium text-zinc-700 mb-1.5 block">Internal note (optional)</label>
                    <textarea
                        value={internalNote}
                        onChange={(e) => setInternalNote(e.target.value.slice(0, 500))}
                        placeholder="Notes for yourself — not sent to attendees."
                        rows={2}
                        className="w-full px-3 py-2 text-sm text-zinc-900 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400 resize-none placeholder:text-zinc-400"
                    />
                    <p className="text-[11px] text-zinc-400 text-right mt-1">{internalNote.length}/500</p>
                </div>
            </div>
        </AttendeesActionModalShell>
    );
}
