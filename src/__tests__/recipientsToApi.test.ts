import { describe, it, expect } from "vitest";
import { recipientsToApi, perRecipientMessages } from "../page/modals/recipientsToApi";
import type { Recipient } from "@cobuntu/management-ui-shared";

/**
 * A staged list, in the shape `add-attendees` and `invitations` accept.
 *
 * Both endpoints take `usertags` and `emails`. The picker hands back
 * Recipients, which carry an id, a usertag and sometimes an address, so this
 * is the join between the two — and the place a member can accidentally be
 * sent twice.
 */

const member: Recipient = {
    id: "u-ana", name: "Ana Neto", usertag: "ana-neto", email: "ana@example.com",
};
const outsider: Recipient = { email: "outsider@example.com" };

describe("splitting the staged list", () => {
    it("sends a member by handle, never also by address", () => {
        /*
         * This is the one that matters. Ana is a member whose address the
         * roster happens to know. Putting her in BOTH arrays is one person,
         * two invitation rows and two emails — which is exactly the duplicate
         * the invitations endpoint then has to dedupe badly.
         */
        expect(recipientsToApi([member])).toEqual({
            usertags: ["ana-neto"], emails: [],
        });
    });

    it("sends somebody with no account by address", () => {
        expect(recipientsToApi([outsider])).toEqual({
            usertags: [], emails: ["outsider@example.com"],
        });
    });

    it("keeps a mixed list in its two halves", () => {
        expect(recipientsToApi([member, outsider])).toEqual({
            usertags: ["ana-neto"], emails: ["outsider@example.com"],
        });
    });

    it("trims an address rather than posting whitespace", () => {
        expect(recipientsToApi([{ email: "  bo@example.com " }]).emails)
            .toEqual(["bo@example.com"]);
    });

    it("drops somebody the endpoint could not look up at all", () => {
        // An account with no handle and no address. Sending an empty string
        // is a 400 that costs the operator the whole batch.
        expect(recipientsToApi([{ id: "u-ghost" }, member])).toEqual({
            usertags: ["ana-neto"], emails: [],
        });
    });

    it("returns both arrays empty rather than undefined", () => {
        // The callers spread these behind `length > 0`.
        expect(recipientsToApi([])).toEqual({ usertags: [], emails: [] });
    });
});

describe("per-recipient overrides", () => {
    it("carries only the people who actually wrote one", () => {
        // Everyone else falls back to customMessage server-side. Sending an
        // empty override would replace their shared note with nothing.
        const staged: Recipient[] = [
            { ...member, note: "Bring the slides" },
            outsider,
        ];
        expect(perRecipientMessages(staged)).toEqual([
            { usertag: "ana-neto", message: "Bring the slides" },
        ]);
    });

    it("addresses an override the same way the main list does", () => {
        expect(perRecipientMessages([{ ...outsider, note: "Details attached" }]))
            .toEqual([{ email: "outsider@example.com", message: "Details attached" }]);
    });

    it("treats a whitespace-only note as no note", () => {
        expect(perRecipientMessages([{ ...member, note: "   " }])).toEqual([]);
    });

    it("trims, so a trailing newline does not reach the email", () => {
        expect(perRecipientMessages([{ ...member, note: " See you\n" }])[0].message)
            .toBe("See you");
    });
});
