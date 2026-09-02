import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Two things about the shared Agenda view.
 *
 *   1. A new agenda item defaults to a time that has something to do with the
 *      event. It used to be a hardcoded 09:00, which is right for almost no
 *      event: a 15:00 event opened the form offering four hours before it
 *      starts, and every row had to be corrected by hand.
 *
 *   2. It styles from TOKENS, so the same component looks like the admin
 *      inside the admin and like the community inside the community app.
 */

const view = readFileSync(resolve(__dirname, "../page/views/AgendaView.tsx"), "utf8");
const theme = readFileSync(resolve(__dirname, "../shared/theme.ts"), "utf8");

describe("a new agenda item starts somewhere sensible", () => {
    it("no longer hardcodes 09:00 as the working default", () => {
        // FALLBACK_START keeps the literal, but only for an event with no
        // start date at all — so the string may appear once, as that constant.
        expect(view.split('"09:00"').length - 1).toBeLessThanOrEqual(1);
        expect(view).toContain("const FALLBACK_START");
    });

    it("seeds from the event and recomputes on every open", () => {
        /*
         * Recomputed in resetForm rather than only at mount: by the time
         * someone adds a third item the schedule has moved, and the useful
         * default moved with it.
         */
        expect(view).toContain("defaultTimesFor(items, event?.startDate)");
        expect(view).toContain("defaultTimesFor([], event?.startDate)");
    });

    it("continues from the last item when there is one", () => {
        // Defaulting the fourth row to the event's start offers 15:00 on a
        // schedule already running to 15:55.
        expect(view).toMatch(/last\s*\n?\s*\?\s*snapToSlot\(localHhmm\(last\.endTime\)\)/);
    });

    it("snaps onto a slot the picker actually offers", () => {
        /*
         * The Select only lists 5-minute slots and renders EMPTY for anything
         * else, so an event starting at 15:03 would open the form with no
         * start time at all.
         */
        expect(view).toContain("function snapToSlot");
        expect(view).toContain("m - (m % TIME_STEP_MINUTES)");
    });

    it("keeps the end inside the day", () => {
        // The end picker only offers slots strictly after the start, so a late
        // start could otherwise produce an end it refuses to show.
        expect(view).toContain("Math.min(toMinutes(start) + 60, LAST_SLOT_MINUTES)");
    });

    it("derives the option list from the same step it snaps to", () => {
        // A grid of 5 and a snap of 10 would put every default off-grid.
        expect(view).toContain("m += TIME_STEP_MINUTES");
    });
});

describe("it styles from tokens, not from hardcoded greys", () => {
    it("has no zinc classes left", () => {
        /*
         * `bg-zinc-50` is the admin's card. Dropped onto a community's own
         * page it reads as a piece of a different product, because it is.
         */
        expect(view).not.toMatch(/zinc-/);
    });

    it("every token falls back to what the admin renders today", () => {
        /*
         * The admin defines NONE of these variables — it has no --brand-color
         * at all — so each fallback fires and the admin is byte-identical.
         * That is what makes this need no per-app flag.
         */
        for (const v of ["--bg-color", "--text-color", "--brand-color", "--card-radius", "--button-radius"]) {
            expect(theme).toMatch(new RegExp(`var\\(${v},\\s*[^)]+\\)`));
        }
    });

    it("uses translucent neutrals for fills that sit over an unknown background", () => {
        // A flat #fafafa is a grey rectangle on a pink page; the same veil
        // tints with whatever is behind it.
        expect(theme).toContain("rgba(128,128,128,0.06)");
    });

    it("keeps destructive red out of the brand token", () => {
        /*
         * Delete is a MEANING, not a brand colour. A community whose brand is
         * red must not end up with an invisible delete button.
         */
        expect(view).toMatch(/text-red-500/);
    });
});
