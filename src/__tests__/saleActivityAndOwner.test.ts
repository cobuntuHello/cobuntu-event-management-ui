import { describe, it, expect } from "vitest";
import { renderActivitySentence } from "../components/activity/activitySentences";
import { readOnlyOwner } from "../page/EventManagePage";

/**
 * A ticket sale reads as a ticket sale, and the owner has a face.
 *
 * ── What was on screen ──────────────────────────────────────────────────────
 *
 * "Someone updated the event", about a guest buying a ticket. Two failures in
 * one line: sales became a third activity source on the backend before this
 * renderer knew the action, so every purchase fell through to the unknown-action
 * default; and a guest checkout has no account, so the actor was null and
 * became "Someone" even though their address was in the payload.
 */

const sale = (payload: Record<string, unknown>, actor: any = null) => ({
    source: 'SALE' as const,
    action: 'PURCHASED',
    actor,
    payload,
});

describe('a purchase reads as a purchase', () => {
    it('names a guest by the address on the sale', () => {
        // The exact row from production: a guest checkout, 23h old, rendered
        // as an anonymous edit.
        const text = renderActivitySentence(
            sale({ buyerEmail: 'ziv909@gmail.com', amount: 2400, currency: 'EUR', quantity: 1 }),
        ).text;
        expect(text).toBe('ziv909@gmail.com bought a ticket for €24.00');
    });

    it('prefers a real name when the buyer has an account', () => {
        const text = renderActivitySentence(
            sale({ amount: 2400, currency: 'EUR', quantity: 1 },
                { id: 'u1', name: 'Bea Buyer', usertag: 'bea', profileImage: null }),
        ).text;
        expect(text).toBe('Bea Buyer bought a ticket for €24.00');
    });

    it('pluralises, because "bought 1 tickets" is the tell of a lazy string', () => {
        expect(renderActivitySentence(
            sale({ amount: 4800, currency: 'EUR', quantity: 2 }, { id: 'u1', name: 'Bea', usertag: null, profileImage: null }),
        ).text).toBe('Bea bought 2 tickets for €48.00');
    });

    it('reads cents as cents', () => {
        // The backend sends the smallest unit and says so. Rendering 2400 as
        // "€2400.00" would be a four-hundred-euro ticket.
        expect(renderActivitySentence(
            sale({ amount: 2400, currency: 'EUR', quantity: 1 }, { id: 'u', name: 'A', usertag: null, profileImage: null }),
        ).text).toContain('€24.00');
    });

    it('does not divide a currency with no minor unit', () => {
        expect(renderActivitySentence(
            sale({ amount: 2400, currency: 'JPY', quantity: 1 }, { id: 'u', name: 'A', usertag: null, profileImage: null }),
        ).text).toContain('¥2400');
    });

    it('still says something sensible with no amount', () => {
        expect(renderActivitySentence(
            sale({ quantity: 1 }, { id: 'u', name: 'A', usertag: null, profileImage: null }),
        ).text).toBe('A bought a ticket');
    });

    it('renders a refund as a refund', () => {
        expect(renderActivitySentence({
            source: 'SALE', action: 'PURCHASE_REFUNDED', actor: null,
            payload: { buyerEmail: 'g@example.com', amount: 2400, currency: 'EUR' },
        }).text).toBe('g@example.com was refunded €24.00');
    });

    it('keeps "Someone" only for a genuinely deleted actor', () => {
        // The fallback still exists; it is just no longer the answer for a
        // guest whose address we hold.
        expect(renderActivitySentence({
            source: 'EVENT_AUDIT', action: 'EVENT_UPDATED', actor: null, payload: null,
        }).text).toBe('Someone updated the event');
    });
});

describe('who owns this event', () => {
    it('resolves the OWNING community, not merely a carrying one', () => {
        /*
         * An event can be listed in several communities and owned by exactly
         * one. Picking the first listing would put a carrying community's icon
         * on a banner claiming ownership.
         */
        const owner = readOnlyOwner({
            communityId: 'c-owner',
            communities: [
                { communityId: 'c-carrier', community: { id: 'c-carrier', name: 'Carrier', iconUrl: 'x.png' } },
                { communityId: 'c-owner', community: { id: 'c-owner', name: 'PBN', iconUrl: 'pbn.png' } },
            ],
        });
        expect(owner).toEqual({ kind: 'community', name: 'PBN', imageUrl: 'pbn.png' });
    });

    it('falls back to the creator host on a member-owned event', () => {
        const owner = readOnlyOwner({
            communityId: null,
            hosts: [
                { role: 'COHOST', user: { name: 'Not Them', profileImage: null } },
                { role: 'CREATOR', user: { name: 'Ana Neto', profileImage: 'ana.png' } },
            ],
        });
        expect(owner).toEqual({ kind: 'person', name: 'Ana Neto', imageUrl: 'ana.png' });
    });

    it('survives a community with no icon', () => {
        // The avatar falls back to an initial; a null here must not crash the
        // page or render a broken image.
        const owner = readOnlyOwner({ communityId: 'c1', communities: [] });
        expect(owner).toEqual({ kind: 'community', name: 'Your community', imageUrl: null });
    });

    it('returns nothing when there is nobody to show', () => {
        expect(readOnlyOwner({ communityId: null, hosts: [] })).toBeNull();
    });
});

/*
 * Add vs Gift phase 4 (backend docs/features/add-vs-gift.md): the Activity
 * tab says a free gift is a gift, and a purchase names its code and recipient.
 */
describe('gifts and codes in the activity log', () => {
    const host = { id: 'h', name: 'Ana Barros', usertag: 'ana', profileImage: null };
    const bulk = (payload: Record<string, unknown>) => ({ source: 'EVENT_AUDIT' as const, action: 'ATTENDEES_BULK_APPROVED', actor: host, payload });

    it('a free gift reads as a gift, a plain add as an add, an old row as before', () => {
        expect(renderActivitySentence(bulk({ count: 1, attendeeNames: ['Rui'], mode: 'gift' })).text).toBe('Ana Barros gave Rui a place as a gift');
        expect(renderActivitySentence(bulk({ count: 5, attendeeNames: ['A', 'B', 'C', 'D'], mode: 'gift' })).text).toBe('Ana Barros gave A, B, C + 2 more a place as a gift');
        expect(renderActivitySentence(bulk({ count: 2, attendeeNames: [], mode: 'gift' })).text).toBe('Ana Barros gave 2 places as a gift');
        expect(renderActivitySentence(bulk({ count: 1, attendeeNames: ['Rui'], mode: 'add' })).text).toBe('Ana Barros added Rui');
        expect(renderActivitySentence(bulk({ count: 1, attendeeNames: ['Rui'] })).text).toBe('Ana Barros added Rui');
    });

    it('a purchase says the code and its percent, and who a bought gift is for', () => {
        const text = renderActivitySentence(sale({
            buyerEmail: 'g@x.com', amount: 1600, currency: 'EUR', quantity: 1,
            discount: { code: 'SUMMER20', amount: 400, percentOff: 20 },
            gift: { recipientName: 'Rita', recipientUsertag: 'rita', recipientEmail: null },
        })).text;
        expect(text).toBe('g@x.com bought a ticket for €16.00 · used SUMMER20 for 20% off · a gift for Rita');
    });

    it('falls back to the amount off, and to a guest recipient\'s email', () => {
        const text = renderActivitySentence(sale({
            buyerEmail: 'g@x.com', amount: 1500, currency: 'EUR', quantity: 1,
            discount: { code: 'FIVER', amount: 500, percentOff: null },
            gift: { recipientName: null, recipientUsertag: null, recipientEmail: 'friend@x.com' },
        })).text;
        expect(text).toBe('g@x.com bought a ticket for €15.00 · used FIVER for €5.00 off · a gift for friend@x.com');
    });
});
