import { describe, it, expect } from "vitest";
import { defaultTimesFor, eventWindow } from "../page/views/AgendaView";
import { placeAddress } from "../lib/google-maps";

/**
 * PBN feedback doc (2026-11-05), the event-wizard bugs.
 *
 *   Bug 2a: picking "ISLA Gaia" kept only the street address.
 *   Bug 2b: the agenda "stopped adding items": the next item's default ran
 *           past the event's end, and the server refused it silently.
 *
 * Bug 1 (Save failing on an off-screen "Standard" tier) is pinned in
 * PriceEditModal.draftMode.test.tsx.
 */

/** A local wall-clock instant on 26 Nov 2026, as an ISO string. */
const at = (h: number, m = 0) => new Date(2026, 10, 26, h, m).toISOString();

describe("Bug 2a: a picked place keeps its name", () => {
    it("stores a venue as 'Name, address'", () => {
        expect(placeAddress({ name: "ISLA Gaia", formatted_address: "R. Diogo Macedo 192, 4400-107 Vila Nova de Gaia, Portugal" }))
            .toBe("ISLA Gaia, R. Diogo Macedo 192, 4400-107 Vila Nova de Gaia, Portugal");
    });

    it("does not repeat a street result's name", () => {
        expect(placeAddress({ name: "R. Diogo Macedo 192", formatted_address: "R. Diogo Macedo 192, 4400-107 Vila Nova de Gaia, Portugal" }))
            .toBe("R. Diogo Macedo 192, 4400-107 Vila Nova de Gaia, Portugal");
    });

    it("falls back to whichever part exists", () => {
        expect(placeAddress({ name: "", formatted_address: "Porto" })).toBe("Porto");
        expect(placeAddress({ name: "ISLA Gaia", formatted_address: "" })).toBe("ISLA Gaia");
    });
});

describe("Bug 2b: agenda defaults stay inside the event", () => {
    // Dino's event: 18:00-22:00, four items, the last ending 21:35.
    const items = [
        { endTime: at(18, 45), order: 1 },
        { endTime: at(20, 15), order: 2 },
        { endTime: at(20, 35), order: 3 },
        { endTime: at(21, 35), order: 4 },
    ];

    it("caps the fifth item's default at the event's end", () => {
        expect(defaultTimesFor(items, at(18), at(22))).toEqual({ start: "21:35", end: "22:00" });
    });

    it("starts before the end when the schedule already reaches it", () => {
        const full = [...items, { endTime: at(22), order: 5 }];
        expect(defaultTimesFor(full, at(18), at(22))).toEqual({ start: "21:30", end: "22:00" });
    });

    it("keeps the one-hour default when there is room", () => {
        expect(defaultTimesFor([], at(18), at(22))).toEqual({ start: "18:00", end: "19:00" });
    });

    it("a multi-day event has no single-day window (the server checks the range)", () => {
        expect(eventWindow(at(18), new Date(2026, 11, 2, 22).toISOString())).toBeNull();
        expect(defaultTimesFor([], at(18), new Date(2026, 11, 2, 22).toISOString())).toEqual({ start: "18:00", end: "19:00" });
    });

    it("reads a same-day event's window in minutes", () => {
        expect(eventWindow(at(18), at(22))).toEqual({ start: 18 * 60, end: 22 * 60 });
    });
});
