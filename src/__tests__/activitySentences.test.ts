/**
 * Pure-function tests for the action → sentence renderer in
 * activitySentences.ts. The component-level test (EventActivityTab)
 * covers the fetch + scroll behaviour separately.
 *
 * Pinned per the user's 2026-06-19 product call: payloads carry
 * human-readable values (names, labels), never raw IDs the FE has
 * to look up. The sentence renderer reads denormalised fields
 * (eventName, tierName, attendeeName, targetName) verbatim and
 * never resolves IDs itself.
 */

import { describe, it, expect } from "vitest";
import {
    renderActivitySentence,
    formatRelativeTime,
    type ActivityEntryForRender,
} from "../components/activity/activitySentences";

const baseActor = { id: "u-bea", name: "Bea Host", usertag: "bea", profileImage: null };

function eventAuditEntry(action: string, payload: Record<string, unknown> | null = null): ActivityEntryForRender {
    return { source: "EVENT_AUDIT", action, actor: baseActor, payload };
}
function hostAuditEntry(action: string, payload: Record<string, unknown> | null = null): ActivityEntryForRender {
    return { source: "HOST_AUDIT", action, actor: baseActor, payload };
}

describe("renderActivitySentence — event lifecycle", () => {
    it("EVENT_CREATED", () => {
        expect(renderActivitySentence(eventAuditEntry("EVENT_CREATED", { eventName: "W35" })).text)
            .toBe("Bea Host created the event");
    });
    it("EVENT_UPDATED lists changed fields", () => {
        expect(
            renderActivitySentence(
                eventAuditEntry("EVENT_UPDATED", { eventName: "W35", fields: ["name", "startDate"] }),
            ).text,
        ).toBe("Bea Host updated the event (name and startDate)");
    });
    it("EVENT_PUBLISHED with listingCount", () => {
        expect(
            renderActivitySentence(eventAuditEntry("EVENT_PUBLISHED", { eventName: "W35", listingCount: 3 })).text,
        ).toBe("Bea Host published the event in 3 communities");
    });
    it("EVENT_UNPUBLISHED includes removed attendees", () => {
        expect(
            renderActivitySentence(
                eventAuditEntry("EVENT_UNPUBLISHED", { eventName: "W35", removedAttendeeCount: 12 }),
            ).text,
        ).toBe("Bea Host unpublished the event (12 attendees removed)");
    });
    it("EVENT_DUPLICATED includes target event name", () => {
        expect(
            renderActivitySentence(
                eventAuditEntry("EVENT_DUPLICATED", {
                    sourceEventName: "W35",
                    targetEventName: "W36",
                    targetEventId: "evt-2",
                }),
            ).text,
        ).toBe('Bea Host duplicated the event as "W36"');
    });
});

describe("renderActivitySentence — settings", () => {
    it("VISIBILITY_UPDATED", () => {
        expect(
            renderActivitySentence(eventAuditEntry("VISIBILITY_UPDATED", { from: "PUBLIC", to: "MEMBERS_ONLY" })).text,
        ).toBe("Bea Host changed visibility to Members only");
    });
    it("ACCESSIBILITY_UPDATED", () => {
        expect(
            renderActivitySentence(eventAuditEntry("ACCESSIBILITY_UPDATED", { from: "PUBLIC", to: "MEMBERS_ONLY" })).text,
        ).toBe("Bea Host changed access to Members only");
    });
    it("DISTRIBUTION_UPDATED handles compound changes", () => {
        const result = renderActivitySentence(
            eventAuditEntry("DISTRIBUTION_UPDATED", {
                from: { detailSource: "NATIVE", externalDetailUrl: null, featured: false },
                to: { detailSource: "EXTERNAL", externalDetailUrl: "https://x.com", featured: true },
            }),
        );
        expect(result.text).toMatch(/custom landing page/);
        expect(result.text).toMatch(/Featured/);
    });
    it("REFUND_POLICY_UPDATED — switch to Extended", () => {
        expect(
            renderActivitySentence(
                eventAuditEntry("REFUND_POLICY_UPDATED", { from: null, to: { mode: "extended" } }),
            ).text,
        ).toBe("Bea Host switched the refund policy to Extended");
    });
    it("HOST_REFUND_BYPASS includes amount", () => {
        expect(
            renderActivitySentence(
                eventAuditEntry("HOST_REFUND_BYPASS", {
                    saleId: "s1",
                    refundAmount: 5000,
                    bypassReason: "no-show",
                }),
            ).text,
        ).toBe("Bea Host issued a refund past the standard window (€50.00)");
    });
});

describe("renderActivitySentence — tiers + agenda", () => {
    it("TIER_CREATED includes the tier name", () => {
        expect(renderActivitySentence(eventAuditEntry("TIER_CREATED", { tierName: "VIP", price: 5000 })).text)
            .toBe('Bea Host created the "VIP" tier');
    });
    it("TIER_UPDATED with fields list", () => {
        expect(
            renderActivitySentence(eventAuditEntry("TIER_UPDATED", { tierName: "VIP", fields: ["price"] })).text,
        ).toBe('Bea Host updated the "VIP" tier (price)');
    });
    it("TIER_SCHEDULED renders sales window", () => {
        expect(
            renderActivitySentence(
                eventAuditEntry("TIER_SCHEDULED", {
                    tierName: "Early Bird",
                    publishedAt: null,
                    salesStartAt: "2026-06-20T00:00:00Z",
                    salesEndAt: null,
                }),
            ).text,
        ).toBe('Bea Host updated the "Early Bird" tier\'s sales window');
    });
    it("AGENDA_ITEM_ADDED with title", () => {
        expect(renderActivitySentence(eventAuditEntry("AGENDA_ITEM_ADDED", { title: "Keynote" })).text)
            .toBe('Bea Host added "Keynote" to the agenda');
    });
    it("AGENDA_ITEM_REMOVED with title", () => {
        expect(renderActivitySentence(eventAuditEntry("AGENDA_ITEM_REMOVED", { title: "Lunch break" })).text)
            .toBe('Bea Host removed "Lunch break" from the agenda');
    });
});

describe("renderActivitySentence — attendees + invitations", () => {
    it("ATTENDEE_APPROVED uses denormalised attendeeName + tierName", () => {
        const result = renderActivitySentence(
            eventAuditEntry("ATTENDEE_APPROVED", {
                attendeeUserId: "u-ana",
                attendeeName: "Ana Buyer",
                attendeeEmail: "ana@example.com",
                tierName: "VIP",
                appliedAt: "2026-06-15T09:00:00.000Z",
            }),
        );
        expect(result.text).toBe('Bea Host approved Ana Buyer into the "VIP" tier');
        expect(result.subjectName).toBe("Ana Buyer");
    });
    it("ATTENDEE_APPROVED falls back to email when name missing", () => {
        const result = renderActivitySentence(
            eventAuditEntry("ATTENDEE_APPROVED", {
                attendeeName: null,
                attendeeEmail: "guest@example.com",
            }),
        );
        expect(result.text).toBe("Bea Host approved guest@example.com");
    });
    it("ATTENDEE_REJECTED", () => {
        expect(
            renderActivitySentence(
                eventAuditEntry("ATTENDEE_REJECTED", { attendeeName: "Chad", attendeeEmail: "c@x.com" }),
            ).text,
        ).toBe("Bea Host rejected Chad's registration");
    });
    it("ATTENDEES_BULK_APPROVED with first 3 names + remainder", () => {
        expect(
            renderActivitySentence(
                eventAuditEntry("ATTENDEES_BULK_APPROVED", {
                    count: 5,
                    attendeeNames: ["Ana", "Bob", "Carlos", "Dee", "Eve"],
                }),
            ).text,
        ).toBe("Bea Host added Ana, Bob, Carlos + 2 more");
    });
    it("ATTENDEES_BULK_APPROVED with names = count renders all inline", () => {
        expect(
            renderActivitySentence(
                eventAuditEntry("ATTENDEES_BULK_APPROVED", {
                    count: 2,
                    attendeeNames: ["Ana", "Bob"],
                }),
            ).text,
        ).toBe("Bea Host added Ana, Bob");
    });
    it("INVITATIONS_SENT count", () => {
        expect(renderActivitySentence(eventAuditEntry("INVITATIONS_SENT", { count: 14 })).text)
            .toBe("Bea Host invited 14 guests");
    });
    it("INVITATION_RESENT with email", () => {
        expect(
            renderActivitySentence(eventAuditEntry("INVITATION_RESENT", { invitedEmail: "g@x.com" })).text,
        ).toBe("Bea Host resent the invitation to g@x.com");
    });
});

describe("renderActivitySentence — host audits", () => {
    it("ADDED renders target name", () => {
        const r = renderActivitySentence(
            hostAuditEntry("ADDED", { targetUserId: "u-alice", targetName: "Alice", targetUsertag: "alice" }),
        );
        expect(r.text).toBe("Bea Host added Alice as a host");
        expect(r.subjectName).toBe("Alice");
    });
    it("PROMOTED_FROM_ATTENDEE", () => {
        expect(
            renderActivitySentence(
                hostAuditEntry("PROMOTED_FROM_ATTENDEE", { targetName: "Carlos" }),
            ).text,
        ).toBe("Bea Host promoted Carlos from attendee to host");
    });
    it("REMOVED + DEMOTED_TO_ATTENDEE", () => {
        expect(renderActivitySentence(hostAuditEntry("REMOVED", { targetName: "Dee" })).text)
            .toBe("Bea Host removed Dee as a host");
        expect(renderActivitySentence(hostAuditEntry("DEMOTED_TO_ATTENDEE", { targetName: "Eve" })).text)
            .toBe("Bea Host demoted Eve from host back to attendee");
    });
    it("falls back to 'a member' when target name missing", () => {
        expect(renderActivitySentence(hostAuditEntry("ADDED", null)).text)
            .toBe("Bea Host added a member as a host");
    });
});

describe("renderActivitySentence — unknown actions + null actor", () => {
    it("unknown action returns a generic fallback", () => {
        expect(renderActivitySentence(eventAuditEntry("FUTURE_ACTION_NOT_RENDERED")).text)
            .toBe("Bea Host updated the event");
    });
    it("null actor surfaces as 'Someone'", () => {
        const entry: ActivityEntryForRender = {
            source: "EVENT_AUDIT",
            action: "EVENT_CREATED",
            actor: null,
            payload: { eventName: "W35" },
        };
        expect(renderActivitySentence(entry).text).toBe("Someone created the event");
    });
});

describe("formatRelativeTime", () => {
    const now = new Date("2026-06-19T12:00:00Z");
    it("just now under 60s", () => {
        expect(formatRelativeTime("2026-06-19T11:59:30Z", now)).toBe("just now");
    });
    it("minutes under 1h", () => {
        expect(formatRelativeTime("2026-06-19T11:30:00Z", now)).toBe("30m ago");
    });
    it("hours under 24h", () => {
        expect(formatRelativeTime("2026-06-19T05:00:00Z", now)).toBe("7h ago");
    });
    it("days under 7d", () => {
        expect(formatRelativeTime("2026-06-17T12:00:00Z", now)).toBe("2d ago");
    });
    it("falls back to absolute date past 7d", () => {
        const result = formatRelativeTime("2026-06-01T10:00:00Z", now);
        // Locale-dependent — pin the year + month being present.
        expect(result).toMatch(/2026/);
        expect(result).toMatch(/Jun|June/);
    });
    it("invalid input returns input verbatim", () => {
        expect(formatRelativeTime("not-a-date", now)).toBe("not-a-date");
    });
});
