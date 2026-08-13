import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Event Options used to be one card holding three unrelated things: the
 * ticket tiers, the two community-only gates, and the host's own approval
 * switch.
 *
 * For a member host the middle two simply disappeared — `hideVisibility`
 * dropped the rows in place — so the card showed holes with nothing saying
 * why. Grouping them under their own heading turns two missing features into
 * one legible rule about ownership.
 *
 * Source assertions: what is under test is the STRUCTURE (which rows live in
 * which card, and which card is conditional), and rendering the whole
 * Luma-style form to assert on DOM order would test far more than that.
 */
describe("EventForm groups the options by ownership", () => {
    /*
     * The single Event Options card mixed three unrelated things: ticket
     * tiers, the two community-only gates, and the host's own approval
     * switch. For a member host the middle two simply disappeared, leaving
     * holes in a list with nothing explaining them.
     */
    const form = () => readFileSync(resolve(__dirname, "../components/EventForm.tsx"), "utf8");

    it("gives the community-only gates their own labelled card", () => {
        const src = form();
        expect(src).toContain("Community access");
        // The whole card is conditional now, not the individual rows.
        expect(src).toMatch(/\{!hideVisibility && \(\s*<div className="mt-6">/);
    });

    it("says WHY the card is there", () => {
        expect(form()).toMatch(/owns this event/);
    });

    it("keeps Approval outside that gate", () => {
        /*
         * requiresApproval is not in COMMUNITY_SCOPED_EVENT_FIELDS, so a
         * member host may set it. Moving it inside would take it from them.
         *
         * Asserted structurally, not by position: the first cut compared the
         * two indexes, which broke the moment the cards were reordered to put
         * the community block last - a true rearrangement failing a test that
         * was really checking nesting.
         */
        const src = form();
        const gateStart = src.indexOf("{!hideVisibility && (");
        const gateEnd = src.indexOf("owns this event", gateStart);
        const approvalIdx = src.indexOf(">Approval</p>");
        const insideGate = approvalIdx > gateStart && approvalIdx < gateEnd;
        expect(insideGate).toBe(false);
    });
});
