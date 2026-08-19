import { describe, expect, it } from "vitest";
import { visibleViews } from "../page/EventManagePage";

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
            .toEqual(["overview", "details", "attendees", "hosts", "agenda"]);
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

    it("appears right after overview when it does", () => {
        const views = visibleViews({ event: host, viewerUserId: "u1", hasLedger: true });
        // Money beside the numbers it explains, before the forms.
        expect(views.indexOf("ledger")).toBe(views.indexOf("overview") + 1);
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
