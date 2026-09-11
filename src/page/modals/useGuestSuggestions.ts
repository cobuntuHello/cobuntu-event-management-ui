"use client";

import { useEffect, useState } from "react";
import { fetchCommunityRoster, type PersonSearchResult } from "@cobuntu/management-ui-shared";

/**
 * "Recently invited" and "Frequent attendees", ready for the picker.
 *
 * ── Why this joins against the roster ───────────────────────────────────────
 *
 * Both endpoints answer `{ usertag, name, profileImage, email }` and NO user
 * id. The picker keys a recipient on the id when there is one, so a suggestion
 * staged without it would key on the address instead — and the same person
 * ticked in the roster would key on the id. Two keys, one person, two chips,
 * and on send two invitations.
 *
 * So each suggestion is resolved to its roster entry by usertag and carries the
 * real id. Anybody the roster does not know is dropped: suggesting somebody who
 * has since left the community is an invitation that fails at the server.
 *
 * The right long-term fix is for both endpoints to return the id, which would
 * make this join and its extra request unnecessary. Until then this works
 * against the BE that is deployed today.
 *
 * Both endpoints are newer than some deployed gateways. A 404 from either is
 * silently an empty row: suggestions are a shortcut, never load-bearing.
 */
export function useGuestSuggestions(opts: {
    apiBaseUrl: string;
    communityTag: string;
    eventId: string;
    authHeaders: () => Record<string, string>;
    /** Skipped entirely while the modal is closed. */
    enabled: boolean;
}): Array<{ label: string; people: PersonSearchResult[] }> {
    const { apiBaseUrl, communityTag, eventId, enabled } = opts;
    const [rows, setRows] = useState<Array<{ label: string; people: PersonSearchResult[] }>>([]);

    useEffect(() => {
        if (!enabled) { setRows([]); return; }
        let cancelled = false;

        (async () => {
            const headers = opts.authHeaders();
            const get = async (path: string): Promise<any[]> => {
                try {
                    const res = await fetch(`${apiBaseUrl}${path}`, { headers });
                    if (!res.ok) return [];
                    const data = await res.json();
                    return Array.isArray(data) ? data : (data?.members ?? []);
                } catch { return []; }
            };

            const [recent, frequent, roster] = await Promise.all([
                get(`/api/communities/${communityTag}/events/${eventId}/recent-invitees?limit=5`),
                get(`/api/communities/${communityTag}/frequent-attendees?limit=5`),
                fetchCommunityRoster({ apiBaseUrl, communityTag, headers }).catch(() => []),
            ]);
            if (cancelled) return;

            const byUsertag = new Map<string, PersonSearchResult>();
            for (const p of roster) {
                if (p.usertag) {
                    byUsertag.set(p.usertag.toLowerCase(), {
                        id: p.id,
                        name: p.name ?? null,
                        usertag: p.usertag,
                        profileImage: p.profileImage ?? null,
                    });
                }
            }

            const resolve = (people: any[]): PersonSearchResult[] => people
                .map((m) => byUsertag.get(String(m?.usertag ?? "").toLowerCase()))
                .filter((p): p is PersonSearchResult => Boolean(p));

            const next: Array<{ label: string; people: PersonSearchResult[] }> = [];
            const r = resolve(recent);
            const f = resolve(frequent);
            if (r.length > 0) next.push({ label: "Recently invited", people: r });
            if (f.length > 0) next.push({ label: "Frequent attendees", people: f });
            setRows(next);
        })();

        return () => { cancelled = true; };
        // authHeaders is a fresh closure on every render; depending on it
        // re-runs this effect forever.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, apiBaseUrl, communityTag, eventId]);

    return rows;
}
