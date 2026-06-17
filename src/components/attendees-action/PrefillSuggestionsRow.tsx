"use client";

import { useEffect, useState } from "react";
import { useEventManagementConfig } from "../../config";
import { UserAvatarFallback } from "../../ui/user-avatar-fallback";

/**
 * Two horizontal scrollable chip rows above the SmartRecipientInput.
 *
 *   - **Recently invited**  → last N people the host invited to ANY
 *                             event in this community. 1-tap-add.
 *   - **Frequent attendees** → top N members who've attended ≥3 past
 *                             events of this community. 1-tap-add.
 *
 * Empty rows hide entirely (no placeholder copy) — newer hosts get a
 * cleaner surface.
 *
 * Data shape mirrors the BE endpoints:
 *   GET /api/communities/:tag/events/:id/recent-invitees?limit=5
 *   GET /api/communities/:tag/frequent-attendees?limit=5
 *
 * Both endpoints return [{ usertag, name, profileImage, email, state }]
 * where state is the same union as Recipient.state — so a frequent
 * attendee who's currently attending THIS event gets a state='attending'
 * marker and clicking them adds a disabled-styled chip (no-op).
 */

interface Member {
    usertag: string;
    name: string;
    email?: string | null;
    profileImage?: string | null;
    state?: "available" | "attending" | "invited" | "cancelled";
}

interface Props {
    communityTag: string;
    eventId: string;
    /** Set of recipient keys already staged, used to grey-out chips. */
    stagedKeys: Set<string>;
    /** Authorization headers for the fetch. Injected by the parent. */
    authHeaders: () => Record<string, string>;
    apiBaseUrl: string;
    onAddMember: (m: Member) => void;
}

export function PrefillSuggestionsRow({
    communityTag,
    eventId,
    stagedKeys,
    authHeaders,
    apiBaseUrl,
    onAddMember,
}: Props) {
    const [recent, setRecent] = useState<Member[]>([]);
    const [frequent, setFrequent] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [rRes, fRes] = await Promise.all([
                    fetch(`${apiBaseUrl}/api/communities/${communityTag}/events/${eventId}/recent-invitees?limit=5`, { headers: authHeaders() }),
                    fetch(`${apiBaseUrl}/api/communities/${communityTag}/frequent-attendees?limit=5`, { headers: authHeaders() }),
                ]);
                // Both endpoints are new; if either 404s on a stale
                // BE deploy, silently fall back to empty rows. The
                // suggestions row is a nice-to-have, never load-bearing.
                if (!cancelled) {
                    if (rRes.ok) {
                        const data = await rRes.json();
                        setRecent(Array.isArray(data) ? data : data.members || []);
                    }
                    if (fRes.ok) {
                        const data = await fRes.json();
                        setFrequent(Array.isArray(data) ? data : data.members || []);
                    }
                }
            } catch { /* silent — see comment above */ }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [communityTag, eventId, apiBaseUrl, authHeaders]);

    const recentFiltered = recent.filter((m) => !stagedKeys.has(`m:${m.usertag}`));
    const frequentFiltered = frequent.filter((m) => !stagedKeys.has(`m:${m.usertag}`));

    if (loading) return null;
    if (recentFiltered.length === 0 && frequentFiltered.length === 0) return null;

    return (
        <div className="space-y-3">
            {recentFiltered.length > 0 && (
                <Row label="Recently invited" members={recentFiltered} onTap={onAddMember} />
            )}
            {frequentFiltered.length > 0 && (
                <Row label="Frequent attendees" members={frequentFiltered} onTap={onAddMember} />
            )}
        </div>
    );
}

function Row({ label, members, onTap }: { label: string; members: Member[]; onTap: (m: Member) => void }) {
    // Pkg-portable avatar.
    const config = useEventManagementConfig();
    const UserAvatar = config.UserAvatar ?? UserAvatarFallback;
    return (
        <div>
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5 px-1">{label}</p>
            <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:thin]">
                {members.map((m) => (
                    <button
                        key={m.usertag}
                        onClick={() => onTap(m)}
                        disabled={m.state === "attending"}
                        title={m.state === "attending" ? "Already attending" : `Add ${m.name}`}
                        className={[
                            "shrink-0 inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border",
                            m.state === "attending"
                                ? "border-emerald-200 bg-emerald-50 opacity-70 cursor-not-allowed"
                                : "border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer transition-colors",
                        ].join(" ")}
                    >
                        <UserAvatar user={m} className="w-5 h-5 shrink-0" />
                        <span className="text-[12px] font-medium text-zinc-900 truncate max-w-[120px]">{m.name}</span>
                        {m.state === "attending" && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-600 shrink-0">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
