/**
 * Action → human-readable sentence renderer for the event activity
 * log. One function (`renderActivitySentence`) keyed on the entry's
 * `action` + `source`; the FE component renders the returned shape
 * with the inline actor/target avatars + names.
 *
 * Design rules:
 *   1. Names are pulled from the hydrated `actor` field (always
 *      present unless the row's actor user was deleted) and from
 *      payload fields denormalized at write time (tierName,
 *      attendeeName, targetName, eventName). We never look up names
 *      ourselves — the BE did that work.
 *   2. Unknown actions fall back to a generic "Bea updated the event"
 *      sentence so a future BE addition doesn't break the render.
 *   3. Sentences are intentionally short — long-form details live on
 *      the optional expandable payload (rendered by the consumer).
 *   4. No i18n for now — English only. Migration to a translation
 *      layer would only touch this file.
 *
 * Mirrors the BE write-site payload shapes documented in
 * services/core/src/domains/events/shared/services/EventAuditService.ts.
 */

export interface ActivityEntryForRender {
    source: 'EVENT_AUDIT' | 'HOST_AUDIT';
    action: string;
    actor: { id: string; name: string | null; usertag: string | null; profileImage: string | null } | null;
    payload: Record<string, unknown> | null;
}

/** Pull the actor's display name, defensively. */
function actorName(entry: ActivityEntryForRender): string {
    return entry.actor?.name?.trim() || entry.actor?.usertag || 'Someone';
}

function str(payload: Record<string, unknown> | null, key: string): string | null {
    if (!payload) return null;
    const v = payload[key];
    return typeof v === 'string' && v.length > 0 ? v : null;
}

function num(payload: Record<string, unknown> | null, key: string): number | null {
    if (!payload) return null;
    const v = payload[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function arr(payload: Record<string, unknown> | null, key: string): string[] {
    if (!payload) return [];
    const v = payload[key];
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string');
}

function fieldsLabel(fields: string[]): string {
    if (fields.length === 0) return '';
    if (fields.length === 1) return ` (${fields[0]})`;
    if (fields.length === 2) return ` (${fields[0]} and ${fields[1]})`;
    return ` (${fields.slice(0, -1).join(', ')}, and ${fields[fields.length - 1]})`;
}

function visibilityLabel(raw: unknown): string {
    if (raw === 'MEMBERS_ONLY') return 'Members only';
    if (raw === 'PUBLIC') return 'Public';
    return String(raw ?? 'Unknown');
}

export interface RenderedSentence {
    /** The full sentence text. The actor is at the start; the consumer
     *  can render the actor's avatar inline at sentence-start by
     *  separating it out, but the simplest render is just `text`. */
    text: string;
    /** Optional subject of the action (attendee / target / tier).
     *  Consumer may render their avatar next to the actor's. */
    subjectName?: string | null;
}

export function renderActivitySentence(entry: ActivityEntryForRender): RenderedSentence {
    const actor = actorName(entry);

    // host_audits actions
    if (entry.source === 'HOST_AUDIT') {
        const targetName = str(entry.payload, 'targetName') ?? str(entry.payload, 'targetUsertag') ?? 'a member';
        switch (entry.action) {
            case 'ADDED':
                return { text: `${actor} added ${targetName} as a host`, subjectName: targetName };
            case 'PROMOTED_FROM_ATTENDEE':
                return { text: `${actor} promoted ${targetName} from attendee to host`, subjectName: targetName };
            case 'REMOVED':
                return { text: `${actor} removed ${targetName} as a host`, subjectName: targetName };
            case 'DEMOTED_TO_ATTENDEE':
                return { text: `${actor} demoted ${targetName} from host back to attendee`, subjectName: targetName };
            default:
                return { text: `${actor} updated hosts`, subjectName: targetName };
        }
    }

    // event_audits actions
    switch (entry.action) {
        case 'EVENT_CREATED':
            return { text: `${actor} created the event` };
        case 'EVENT_UPDATED': {
            const fields = arr(entry.payload, 'fields');
            return { text: `${actor} updated the event${fieldsLabel(fields)}` };
        }
        case 'EVENT_PUBLISHED': {
            const count = num(entry.payload, 'listingCount');
            return { text: count != null && count > 0 ? `${actor} published the event in ${count} ${count === 1 ? 'community' : 'communities'}` : `${actor} published the event` };
        }
        case 'EVENT_UNPUBLISHED': {
            const removed = num(entry.payload, 'removedAttendeeCount');
            return { text: removed != null && removed > 0 ? `${actor} unpublished the event (${removed} ${removed === 1 ? 'attendee' : 'attendees'} removed)` : `${actor} unpublished the event` };
        }
        case 'EVENT_DELETED':
            return { text: `${actor} deleted the event` };
        case 'EVENT_DUPLICATED': {
            const target = str(entry.payload, 'targetEventName');
            return { text: target ? `${actor} duplicated the event as "${target}"` : `${actor} duplicated the event` };
        }

        case 'VISIBILITY_UPDATED': {
            const to = entry.payload?.to;
            return { text: `${actor} changed visibility to ${visibilityLabel(to)}` };
        }
        case 'ACCESSIBILITY_UPDATED': {
            const to = entry.payload?.to;
            return { text: `${actor} changed access to ${visibilityLabel(to)}` };
        }
        case 'DISTRIBUTION_UPDATED': {
            const to = entry.payload?.to as Record<string, unknown> | undefined;
            const detailSource = to?.detailSource;
            const featured = to?.featured;
            const parts: string[] = [];
            if (detailSource === 'EXTERNAL') parts.push('switched to a custom landing page');
            else if (detailSource === 'NATIVE') parts.push('switched back to the Cobuntu landing page');
            if (featured === true) parts.push('marked the event as Featured');
            else if (featured === false) parts.push('removed the Featured badge');
            const label = parts.length > 0 ? parts.join(' and ') : 'updated distribution';
            return { text: `${actor} ${label}` };
        }
        case 'MEMBERSHIP_FUNNEL_UPDATED':
            return { text: `${actor} updated the membership funnel` };
        case 'REFUND_POLICY_UPDATED': {
            const to = entry.payload?.to as Record<string, unknown> | null | undefined;
            if (to === null) return { text: `${actor} reset the refund policy to default` };
            const mode = to?.mode;
            if (mode === 'extended') return { text: `${actor} switched the refund policy to Extended` };
            if (mode === 'default') return { text: `${actor} switched the refund policy to Standard` };
            return { text: `${actor} updated the refund policy` };
        }
        case 'HOST_REFUND_BYPASS': {
            const amount = num(entry.payload, 'refundAmount');
            const amountLabel = amount != null ? ` (€${(amount / 100).toFixed(2)})` : '';
            return { text: `${actor} issued a refund past the standard window${amountLabel}` };
        }

        case 'TIER_CREATED': {
            const tier = str(entry.payload, 'tierName');
            return { text: tier ? `${actor} created the "${tier}" tier` : `${actor} created a tier`, subjectName: tier };
        }
        case 'TIER_UPDATED': {
            const tier = str(entry.payload, 'tierName');
            const fields = arr(entry.payload, 'fields');
            return { text: `${actor} updated the ${tier ? `"${tier}" tier` : 'tier'}${fieldsLabel(fields)}`, subjectName: tier };
        }
        case 'TIER_DELETED': {
            const tier = str(entry.payload, 'tierName');
            return { text: tier ? `${actor} deleted the "${tier}" tier` : `${actor} deleted a tier`, subjectName: tier };
        }
        case 'TIER_SCHEDULED': {
            const tier = str(entry.payload, 'tierName');
            return { text: `${actor} updated the ${tier ? `"${tier}" tier` : 'tier'}'s sales window`, subjectName: tier };
        }

        case 'AGENDA_ITEM_ADDED': {
            const title = str(entry.payload, 'title');
            return { text: title ? `${actor} added "${title}" to the agenda` : `${actor} added an agenda item` };
        }
        case 'AGENDA_ITEM_UPDATED': {
            const title = str(entry.payload, 'title');
            return { text: title ? `${actor} updated the "${title}" agenda item` : `${actor} updated an agenda item` };
        }
        case 'AGENDA_ITEM_REMOVED': {
            const title = str(entry.payload, 'title');
            return { text: title ? `${actor} removed "${title}" from the agenda` : `${actor} removed an agenda item` };
        }

        case 'ATTENDEE_APPROVED': {
            const name = str(entry.payload, 'attendeeName') ?? str(entry.payload, 'attendeeEmail') ?? 'an attendee';
            const tier = str(entry.payload, 'tierName');
            return {
                text: tier ? `${actor} approved ${name} into the "${tier}" tier` : `${actor} approved ${name}`,
                subjectName: name,
            };
        }
        case 'ATTENDEE_REJECTED': {
            const name = str(entry.payload, 'attendeeName') ?? str(entry.payload, 'attendeeEmail') ?? 'an attendee';
            return { text: `${actor} rejected ${name}'s registration`, subjectName: name };
        }
        case 'ATTENDEE_REMOVED': {
            const name = str(entry.payload, 'attendeeName') ?? str(entry.payload, 'attendeeEmail') ?? 'an attendee';
            return { text: `${actor} removed ${name} from the event`, subjectName: name };
        }
        case 'ATTENDEES_BULK_APPROVED': {
            const count = num(entry.payload, 'count') ?? 0;
            const names = arr(entry.payload, 'attendeeNames');
            if (count <= 0) return { text: `${actor} added attendees` };
            if (names.length === 0) return { text: `${actor} added ${count} ${count === 1 ? 'attendee' : 'attendees'}` };
            // Show up to 3 names inline, then "+ N more" if longer.
            const inline = names.slice(0, 3).join(', ');
            const remaining = count - Math.min(3, names.length);
            return { text: remaining > 0 ? `${actor} added ${inline} + ${remaining} more` : `${actor} added ${inline}` };
        }
        case 'ATTENDEES_BULK_REJECTED': {
            const count = num(entry.payload, 'count') ?? 0;
            return { text: `${actor} rejected ${count} ${count === 1 ? 'registration' : 'registrations'}` };
        }

        case 'INVITATIONS_SENT': {
            const count = num(entry.payload, 'count') ?? 0;
            return { text: `${actor} invited ${count} ${count === 1 ? 'guest' : 'guests'}` };
        }
        case 'INVITATION_RESENT': {
            const email = str(entry.payload, 'invitedEmail');
            return { text: email ? `${actor} resent the invitation to ${email}` : `${actor} resent an invitation` };
        }

        default:
            // Unknown action — render a non-misleading fallback so the
            // feed keeps moving when a new enum value ships before the
            // FE ships its renderer.
            return { text: `${actor} updated the event` };
    }
}

/**
 * Human-friendly "5 minutes ago" / "yesterday" / absolute-date label.
 * Pure function; no localisation. Mirrors the rough granularity of
 * Twitter/Slack timeline labels — exact ISO is on the title attr for
 * hover detail.
 */
export function formatRelativeTime(iso: string, now: Date): string {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return iso;
    const deltaMs = now.getTime() - t;
    const sec = Math.floor(deltaMs / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    // For older entries, drop relative + render the date — keeps the
    // feed scannable for long-running events.
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
