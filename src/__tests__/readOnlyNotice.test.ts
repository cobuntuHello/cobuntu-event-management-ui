import { describe, expect, it } from "vitest";
import { readOnlyNoticeCopy } from "../page/EventManagePage";

/**
 * What the read-only notice says, and to whom.
 *
 * The live case that produced this test: PBN's own "Startup Founders' Night".
 * PBN owns it (`events.communityId` set) and receives the money for it, but a
 * PBN leader without EVENTS_CREATE was told "Álvaro de Mello Almeida runs this
 * event. Your community carries it" and pointed at a listing negotiation that
 * does not exist. Álvaro is simply the member who created the row, and he
 * creates all of PBN's recurring events, so the same wrong name appeared every
 * time.
 *
 * The condition gating the notice was correct; only the words were wrong.
 */

const HOSTS = [{ role: "CREATOR", user: { name: "Álvaro de Mello Almeida" } }];

describe("readOnlyNoticeCopy", () => {
    describe("when the COMMUNITY owns the event", () => {
        const copy = readOnlyNoticeCopy({ communityId: "pbn-uuid", hosts: HOSTS });

        it("says the community owns it", () => {
            expect(copy.title).toBe("Your community owns this event.");
        });

        it("does NOT name the member who created the row", () => {
            expect(copy.title).not.toMatch(/Álvaro/);
            expect(copy.body).not.toMatch(/Álvaro/);
        });

        it("points at the missing permission, not at a negotiation", () => {
            expect(copy.body).toMatch(/permission/i);
            expect(copy.body).not.toMatch(/listing conversation/i);
            expect(copy.body).not.toMatch(/carries it/i);
        });
    });

    describe("when a MEMBER owns it and the community only carries it", () => {
        const copy = readOnlyNoticeCopy({ communityId: null, hosts: HOSTS });

        it("names the host", () => {
            expect(copy.title).toBe("Álvaro de Mello Almeida runs this event.");
        });

        it("sends them to the listing conversation", () => {
            expect(copy.body).toMatch(/listing conversation/i);
        });

        it("falls back when no host is named", () => {
            expect(readOnlyNoticeCopy({ communityId: null, hosts: [] }).title)
                .toBe("This event belongs to its host.");
        });

        it("uses the first host when none is marked CREATOR", () => {
            const c = readOnlyNoticeCopy({
                communityId: null,
                hosts: [{ role: "COHOST", user: { name: "Art Linkov" } }],
            });
            expect(c.title).toBe("Art Linkov runs this event.");
        });
    });

    it("treats an absent communityId as member-owned, never the reverse", () => {
        // Guards the direction of the check: defaulting a missing field to
        // community-owned would tell a real host they lack permission on their
        // own event, which is the worse failure of the two.
        expect(readOnlyNoticeCopy({ hosts: HOSTS }).title)
            .toBe("Álvaro de Mello Almeida runs this event.");
    });

    it("carries no em-dash in either line", () => {
        for (const e of [{ communityId: "c1" }, { communityId: null, hosts: HOSTS }]) {
            const c = readOnlyNoticeCopy(e);
            expect(c.title).not.toContain("—");
            expect(c.body).not.toContain("—");
        }
    });
});
