import {
    agendaDurationMinutes,
    splitDuration,
    formatDurationShort,
} from "../shared/agendaDuration";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * How long an agenda item lasts.
 *
 * The manage row showed a start over an end and left the reader to subtract —
 * which is exactly the sum someone is doing when they scan an agenda to check
 * the shape of a session. The pill does it for them.
 *
 * The interesting half is when there is NO honest answer. Returning 0 there
 * would put a confident "0 min" next to an item, which is worse than saying
 * nothing: it reads as a fact rather than as missing data.
 */

const at = (hhmm: string) => `2026-09-11T${hhmm}:00.000Z`;

describe("the duration", () => {
    it("is the gap between the two times", () => {
        expect(agendaDurationMinutes(at("15:00"), at("15:05"))).toBe(5);
        expect(agendaDurationMinutes(at("15:10"), at("15:50"))).toBe(40);
    });

    it("counts across an hour boundary", () => {
        expect(agendaDurationMinutes(at("15:50"), at("16:00"))).toBe(10);
        expect(agendaDurationMinutes(at("09:00"), at("11:30"))).toBe(150);
    });
});

describe("when there is no honest answer, it says nothing", () => {
    it("is null without an end time", () => {
        // Legal: older items were saved without one.
        expect(agendaDurationMinutes(at("15:00"), null)).toBeNull();
        expect(agendaDurationMinutes(at("15:00"), undefined)).toBeNull();
    });

    it("is null without a start time", () => {
        expect(agendaDurationMinutes(null, at("15:05"))).toBeNull();
    });

    it("is null for an unparseable timestamp", () => {
        expect(agendaDurationMinutes("not a date", at("15:05"))).toBeNull();
        expect(agendaDurationMinutes(at("15:00"), "")).toBeNull();
    });

    it("is null for a zero-length item, not 0", () => {
        /*
         * The distinction the whole null-vs-0 decision rests on. "0 min" next
         * to an item reads as a fact about the item; no pill reads as missing
         * data, which is what it is.
         */
        expect(agendaDurationMinutes(at("15:00"), at("15:00"))).toBeNull();
    });

    it("is null when the end precedes the start", () => {
        /*
         * Not a long item that crosses midnight — the agenda form builds both
         * times on the event's own date, so it cannot express that, and a
         * backwards pair is bad data rather than a 23-hour session.
         */
        expect(agendaDurationMinutes(at("15:30"), at("15:00"))).toBeNull();
    });
});

describe("the English rendering", () => {
    it("reads as plain minutes under an hour", () => {
        expect(formatDurationShort(5)).toBe("5 min");
        expect(formatDurationShort(59)).toBe("59 min");
    });

    it("drops the minutes when there are none", () => {
        // "2h", not "2h 0m".
        expect(formatDurationShort(60)).toBe("1h");
        expect(formatDurationShort(120)).toBe("2h");
    });

    it("shows both when there are both", () => {
        expect(formatDurationShort(90)).toBe("1h 30m");
        expect(formatDurationShort(125)).toBe("2h 5m");
    });
});

describe("splitDuration", () => {
    it("puts the hour boundary in one place, so both apps agree", () => {
        expect(splitDuration(90)).toEqual({ hours: 1, minutes: 30 });
        expect(splitDuration(59)).toEqual({ hours: 0, minutes: 59 });
        expect(splitDuration(60)).toEqual({ hours: 1, minutes: 0 });
    });
});

describe("the manage row renders it", () => {
    const view = readFileSync(resolve(__dirname, "../page/views/AgendaView.tsx"), "utf8");

    it("uses the shared calculation rather than subtracting inline", () => {
        expect(view).toContain("agendaDurationMinutes(item.startTime, item.endTime)");
    });

    it("renders nothing when there is no duration", () => {
        expect(view).toContain("if (mins === null) return null;");
    });
});

describe("it is exported for the community app", () => {
    it("is on the package's public surface", () => {
        /*
         * The member-facing event page lives in another repo and must show the
         * same pill. Unexported, it would be reimplemented there — and "end
         * minus start" written twice is how two screens end up disagreeing
         * about the same item.
         */
        const index = readFileSync(resolve(__dirname, "../index.ts"), "utf8");
        expect(index).toContain("agendaDurationMinutes");
        expect(index).toContain("splitDuration");
    });
});
