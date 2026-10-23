import { describe, expect, it } from "vitest";
import { visibleViews } from "../page/EventManagePage";
import { SECTION_KEYS } from "../page/sections/SectionsNav";

/**
 * Which tabs the event manage page offers.
 *
 * THIS TEST DID NOT EXIST, and its absence is why it is worth writing now.
 * SectionsNav renders the INTERSECTION of its own SECTIONS list and this
 * function's answer, so a tab added to one and not the other is silently
 * dropped. That is not hypothetical: on the product side it shipped -- Details
 * reached the nav but not the allowed set, and editing a product became
 * unreachable in production. The product package grew a test pinning its exact
 * set as a result. The event package never did.
 */

const host = { hosts: [{ userId: "u1" }] };

describe("the tab set", () => {
    it("gives a host the working tabs", () => {
        expect(visibleViews({ event: host, viewerUserId: "u1" }))
            .toEqual(["overview", "details", "pricing", "attendees", "hosts", "agenda"]);
    });

    /*
     * "listings" is deliberately absent: Overview carries the listings. The KEY
     * still resolves, so an existing ?view=listings link keeps working.
     */
    it("does not offer a listings tab", () => {
        expect(visibleViews({ event: host, viewerUserId: "u1" })).not.toContain("listings");
    });

    it("adds activity for a moderator", () => {
        expect(visibleViews({ event: host, forceModerator: true })).toContain("activity");
    });
});

describe("the ledger tab", () => {
    it("is absent when the host app passes no panel", () => {
        expect(visibleViews({ event: host, viewerUserId: "u1" })).not.toContain("ledger");
    });

    it("appears after details when it does", () => {
        const views = visibleViews({ event: host, viewerUserId: "u1", hasLedger: true });
        expect(views).toEqual(["overview", "details", "pricing", "ledger", "attendees", "hosts", "agenda"]);
    });

    /*
     * What a person SEES is ordered by SECTIONS in the nav, which renders
     * SECTIONS filtered by visibleViews -- that list decides whether, this one
     * decides where. Pinning order only in the other list pins nothing.
     *
     * This asserted ADJACENCY (details + 1) and Pricing now sits between the
     * two, so it is relaxed to the rule it was actually defending: the ledger
     * belongs after the editing surfaces, not in front of them. Adjacency was
     * how that was expressed when Details was the only thing before it; it was
     * never the point, and keeping it would have meant putting Pricing
     * somewhere the person asking for it did not want it.
     */
    it("is ordered after details in the nav, which is what decides", () => {
        expect(SECTION_KEYS.indexOf("ledger")).toBeGreaterThan(SECTION_KEYS.indexOf("details"));
    });

    /*
     * The admin app passes forceModerator on events, so this is the path that
     * decides whether a leader ever sees the ledger there. They are the party
     * the community column is for.
     */
    it("is offered to a moderator", () => {
        expect(visibleViews({ event: host, forceModerator: true, hasLedger: true }))
            .toContain("ledger");
    });
});

/**
 * The trap this file was written for, now applied to Pricing.
 *
 * A key in the nav's SECTIONS but not in visibleViews renders nothing; a key
 * in visibleViews but not SECTIONS is unreachable. Either way the tab silently
 * does not exist, which is how product lost Details in production.
 */
describe("the pricing tab", () => {
    it("is in the allowed set for a plain host", () => {
        expect(visibleViews({ event: host, viewerUserId: "u1" })).toContain("pricing");
    });

    it("is in the nav's own list too, so the intersection keeps it", () => {
        expect(SECTION_KEYS).toContain("pricing");
    });

    it("sits immediately after details, which is where it was asked for", () => {
        expect(SECTION_KEYS.indexOf("pricing")).toBe(SECTION_KEYS.indexOf("details") + 1);
    });

    it("is offered to a moderator as well", () => {
        expect(visibleViews({ event: host, forceModerator: true })).toContain("pricing");
    });
});

/**
 * Tab ORDER, as the product owner set it on 2026-10-23.
 *
 * SECTIONS decides where, visibleViews decides whether. Pinning the order here
 * means a later edit to either list cannot quietly reshuffle the strip -- and
 * the order is a product decision, not an implementation detail, so it is
 * worth a test that fails loudly rather than a comment nobody reads.
 */
describe("the tab order", () => {
    it("reads as the life of an event", () => {
        expect(SECTION_KEYS.slice(0, 7)).toEqual([
            "overview", "details", "pricing", "hosts", "attendees", "agenda", "ledger",
        ]);
    });

    it("puts the ledger last of the seven, after the people and the plan", () => {
        // Money is the outcome; it used to sit second, in front of everything
        // that produces it.
        expect(SECTION_KEYS.indexOf("ledger")).toBeGreaterThan(SECTION_KEYS.indexOf("agenda"));
    });
});
