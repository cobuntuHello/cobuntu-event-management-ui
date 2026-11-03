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
 *   4. Every sentence goes through the host translator (getEventT, keys
 *      under eventsUi.manageUi.activitySentences), so a pt-PT host reads
 *      Portuguese. With no translator it renders the built-in English.
 *
 * Mirrors the BE write-site payload shapes documented in
 * services/core/src/domains/events/shared/services/EventAuditService.ts.
 */

import { getEventT } from '../../create-wizard/i18n';

const NS = 'eventsUi.manageUi.activitySentences';

export interface ActivityEntryForRender {
    source: 'EVENT_AUDIT' | 'HOST_AUDIT' | 'SALE';
    action: string;
    actor: { id: string; name: string | null; usertag: string | null; profileImage: string | null } | null;
    payload: Record<string, unknown> | null;
}

/**
 * Pull the actor's display name, defensively.
 *
 * A GUEST buyer has no account, so there is no actor to hydrate — and this
 * used to answer "Someone" about a person whose email was sitting in the
 * payload. The buyer's address is carried for exactly this case.
 *
 * "Someone" survives only as the last resort, for a row whose actor user was
 * genuinely deleted.
 */
function actorName(entry: ActivityEntryForRender): string {
    return entry.actor?.name?.trim()
        || entry.actor?.usertag
        || str(entry.payload, 'buyerEmail')
        || getEventT(NS)('someone');
}

/**
 * "EUR 24.00" from the payload's smallest-unit amount.
 *
 * The backend sends CENTS and says so — dividing here rather than there keeps
 * currency rendering in one place, and `grossAmount` arrives as a Number
 * already, because the Decimal it comes from serialises to a string.
 */
function amountLabel(payload: Record<string, unknown> | null): string | null {
    const amount = num(payload, 'amount');
    if (amount == null) return null;
    const currency = str(payload, 'currency') || 'EUR';
    const symbol: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', BRL: 'R$', JPY: '¥' };
    // JPY has no minor unit; dividing would be wrong.
    const major = currency === 'JPY' ? amount : amount / 100;
    return `${symbol[currency] || currency + ' '}${major.toFixed(currency === 'JPY' ? 0 : 2)}`;
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
    const t = getEventT(NS);
    if (fields.length === 0) return '';
    if (fields.length === 1) return t('fieldsOne', { a: fields[0] });
    if (fields.length === 2) return t('fieldsTwo', { a: fields[0], b: fields[1] });
    return t('fieldsMany', { list: fields.slice(0, -1).join(', '), last: fields[fields.length - 1] });
}

function visibilityLabel(raw: unknown): string {
    const t = getEventT(NS);
    if (raw === 'MEMBERS_ONLY') return t('visibilityMembersOnly');
    if (raw === 'PUBLIC') return t('visibilityPublic');
    return raw == null ? t('visibilityUnknown') : String(raw);
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
    const t = getEventT(NS);
    const actor = actorName(entry);

    // host_audits actions
    if (entry.source === 'HOST_AUDIT') {
        const targetName = str(entry.payload, 'targetName') ?? str(entry.payload, 'targetUsertag') ?? t('aMember');
        switch (entry.action) {
            case 'ADDED':
                return { text: t('hostAdded', { actor, target: targetName }), subjectName: targetName };
            case 'PROMOTED_FROM_ATTENDEE':
                return { text: t('hostPromoted', { actor, target: targetName }), subjectName: targetName };
            case 'REMOVED':
                return { text: t('hostRemoved', { actor, target: targetName }), subjectName: targetName };
            case 'DEMOTED_TO_ATTENDEE':
                return { text: t('hostDemoted', { actor, target: targetName }), subjectName: targetName };
            default:
                return { text: t('hostsUpdated', { actor }), subjectName: targetName };
        }
    }

    // event_audits actions
    switch (entry.action) {
        case 'EVENT_CREATED':
            return { text: t('eventCreated', { actor }) };
        case 'EVENT_UPDATED': {
            const fields = arr(entry.payload, 'fields');
            return { text: t('eventUpdatedFields', { actor, fields: fieldsLabel(fields) }) };
        }
        case 'EVENT_PUBLISHED': {
            const count = num(entry.payload, 'listingCount');
            return { text: count != null && count > 0 ? t('eventPublishedIn', { actor, count }) : t('eventPublished', { actor }) };
        }
        case 'EVENT_UNPUBLISHED': {
            const removed = num(entry.payload, 'removedAttendeeCount');
            return { text: removed != null && removed > 0 ? t('eventUnpublishedRemoved', { actor, count: removed }) : t('eventUnpublished', { actor }) };
        }
        case 'EVENT_DELETED':
            return { text: t('eventDeleted', { actor }) };
        case 'EVENT_DUPLICATED': {
            const target = str(entry.payload, 'targetEventName');
            return { text: target ? t('eventDuplicatedAs', { actor, target }) : t('eventDuplicated', { actor }) };
        }

        case 'VISIBILITY_UPDATED': {
            const to = entry.payload?.to;
            return { text: t('visibilityChanged', { actor, to: visibilityLabel(to) }) };
        }
        case 'ACCESSIBILITY_UPDATED': {
            const to = entry.payload?.to;
            return { text: t('accessChanged', { actor, to: visibilityLabel(to) }) };
        }
        case 'DISTRIBUTION_UPDATED': {
            const to = entry.payload?.to as Record<string, unknown> | undefined;
            const detailSource = to?.detailSource;
            const featured = to?.featured;
            const parts: string[] = [];
            if (detailSource === 'EXTERNAL') parts.push(t('distCustomLanding'));
            else if (detailSource === 'NATIVE') parts.push(t('distNativeLanding'));
            if (featured === true) parts.push(t('distFeatured'));
            else if (featured === false) parts.push(t('distUnfeatured'));
            const label = parts.length === 2
                ? t('distJoin', { a: parts[0], b: parts[1] })
                : parts.length === 1 ? parts[0] : t('distUpdated');
            return { text: t('distribution', { actor, label }) };
        }
        case 'MEMBERSHIP_FUNNEL_UPDATED':
            return { text: t('funnelUpdated', { actor }) };
        case 'REFUND_POLICY_UPDATED': {
            const to = entry.payload?.to as Record<string, unknown> | null | undefined;
            if (to === null) return { text: t('refundPolicyReset', { actor }) };
            const mode = to?.mode;
            if (mode === 'extended') return { text: t('refundPolicyExtended', { actor }) };
            if (mode === 'default') return { text: t('refundPolicyStandard', { actor }) };
            return { text: t('refundPolicyUpdated', { actor }) };
        }
        case 'HOST_REFUND_BYPASS': {
            const amount = num(entry.payload, 'refundAmount');
            const amountLabel = amount != null ? t('bypassAmount', { amount: `€${(amount / 100).toFixed(2)}` }) : '';
            return { text: t('refundBypass', { actor, amount: amountLabel }) };
        }

        case 'TIER_CREATED': {
            const tier = str(entry.payload, 'tierName');
            return { text: tier ? t('tierCreatedNamed', { actor, tier }) : t('tierCreated', { actor }), subjectName: tier };
        }
        case 'TIER_UPDATED': {
            const tier = str(entry.payload, 'tierName');
            const fields = fieldsLabel(arr(entry.payload, 'fields'));
            return { text: tier ? t('tierUpdatedNamed', { actor, tier, fields }) : t('tierUpdated', { actor, fields }), subjectName: tier };
        }
        case 'TIER_DELETED': {
            const tier = str(entry.payload, 'tierName');
            return { text: tier ? t('tierDeletedNamed', { actor, tier }) : t('tierDeleted', { actor }), subjectName: tier };
        }
        case 'TIER_SCHEDULED': {
            const tier = str(entry.payload, 'tierName');
            return { text: tier ? t('tierScheduledNamed', { actor, tier }) : t('tierScheduled', { actor }), subjectName: tier };
        }

        case 'AGENDA_ITEM_ADDED': {
            const title = str(entry.payload, 'title');
            return { text: title ? t('agendaAddedNamed', { actor, title }) : t('agendaAdded', { actor }) };
        }
        case 'AGENDA_ITEM_UPDATED': {
            const title = str(entry.payload, 'title');
            return { text: title ? t('agendaUpdatedNamed', { actor, title }) : t('agendaUpdated', { actor }) };
        }
        case 'AGENDA_ITEM_REMOVED': {
            const title = str(entry.payload, 'title');
            return { text: title ? t('agendaRemovedNamed', { actor, title }) : t('agendaRemoved', { actor }) };
        }

        case 'ATTENDEE_APPROVED': {
            const name = str(entry.payload, 'attendeeName') ?? str(entry.payload, 'attendeeEmail') ?? t('anAttendee');
            const tier = str(entry.payload, 'tierName');
            return {
                text: tier ? t('attendeeApprovedTier', { actor, name, tier }) : t('attendeeApproved', { actor, name }),
                subjectName: name,
            };
        }
        case 'ATTENDEE_REJECTED': {
            const name = str(entry.payload, 'attendeeName') ?? str(entry.payload, 'attendeeEmail') ?? t('anAttendee');
            return { text: t('attendeeRejected', { actor, name }), subjectName: name };
        }
        case 'ATTENDEE_REMOVED': {
            const name = str(entry.payload, 'attendeeName') ?? str(entry.payload, 'attendeeEmail') ?? t('anAttendee');
            return { text: t('attendeeRemoved', { actor, name }), subjectName: name };
        }
        case 'ATTENDEES_BULK_APPROVED': {
            const count = num(entry.payload, 'count') ?? 0;
            const names = arr(entry.payload, 'attendeeNames');
            if (count <= 0) return { text: t('attendeesAdded', { actor }) };
            if (names.length === 0) return { text: t('attendeesAddedCount', { actor, count }) };
            // Show up to 3 names inline, then "+ N more" if longer.
            const inline = names.slice(0, 3).join(', ');
            const remaining = count - Math.min(3, names.length);
            return { text: remaining > 0 ? t('attendeesAddedNamesMore', { actor, names: inline, remaining }) : t('attendeesAddedNames', { actor, names: inline }) };
        }
        case 'ATTENDEES_BULK_REJECTED': {
            const count = num(entry.payload, 'count') ?? 0;
            return { text: t('registrationsRejected', { actor, count }) };
        }

        case 'INVITATIONS_SENT': {
            const count = num(entry.payload, 'count') ?? 0;
            return { text: t('guestsInvited', { actor, count }) };
        }
        case 'INVITATION_RESENT': {
            const email = str(entry.payload, 'invitedEmail');
            return { text: email ? t('invitationResentTo', { actor, email }) : t('invitationResent', { actor }) };
        }

        /*
         * A ticket changing hands, not an edit to the event.
         *
         * These shipped on the backend as a third activity source before this
         * renderer knew about them, so every purchase fell through to the
         * default below and read as "Someone updated the event" — wrong about
         * what happened AND about who did it. A guest's address now names them
         * (see actorName).
         */
        case 'PURCHASED': {
            const money = amountLabel(entry.payload);
            const qty = num(entry.payload, 'quantity') ?? 1;
            return { text: money ? t('boughtFor', { actor, count: qty, money }) : t('bought', { actor, count: qty }) };
        }
        case 'PURCHASE_REFUNDED': {
            const money = amountLabel(entry.payload);
            return { text: money ? t('refundedAmount', { actor, money }) : t('refunded', { actor }) };
        }

        default:
            // Unknown action — render a non-misleading fallback so the
            // feed keeps moving when a new enum value ships before the
            // FE ships its renderer.
            return { text: t('eventUpdated', { actor }) };
    }
}

/**
 * Human-friendly "5 minutes ago" / "yesterday" / absolute-date label.
 * Mirrors the rough granularity of Twitter/Slack timeline labels — exact
 * ISO is on the title attr for hover detail. Words through the host
 * translator; the absolute date already follows the browser locale.
 */
export function formatRelativeTime(iso: string, now: Date): string {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return iso;
    const tr = getEventT(NS);
    const deltaMs = now.getTime() - t;
    const sec = Math.floor(deltaMs / 1000);
    if (sec < 60) return tr('justNow');
    const min = Math.floor(sec / 60);
    if (min < 60) return tr('minutesAgo', { count: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return tr('hoursAgo', { count: hr });
    const day = Math.floor(hr / 24);
    if (day < 7) return tr('daysAgo', { count: day });
    // For older entries, drop relative + render the date — keeps the
    // feed scannable for long-running events.
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
