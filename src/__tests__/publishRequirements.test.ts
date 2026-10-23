import { describe, it, expect } from "vitest";
import { getEventStatus } from "../page/helpers";

/**
 * What the UI says is missing before an event can be published.
 *
 * This list MIRRORS the server's publish gate. It exists so the Publish CTA
 * can be gated upfront instead of letting a host press it and collect a 400 —
 * which means a mirror that is stricter than what it mirrors is not a safety
 * net, it is a bug with a confident error message. That is exactly what it
 * became on 2026-10-23, when the server stopped requiring dates and a
 * location and this list did not.
 *
 * These pin the agreement in the direction that actually fails silently: the
 * UI refusing something the API would have accepted.
 */

const future = (days: number) => new Date(Date.now() + days * 86400000);

/** An event that is publishable, used as the base each case deviates from. */
function publishable(over: Record<string, unknown> = {}) {
  const start = future(30);
  return {
    name: "Te",
    startDate: start.toISOString(),
    endDate: new Date(start.getTime() + 2 * 3600_000).toISOString(),
    physicalLocation: "Venue",
    tiers: [{ id: "t1", publishedAt: new Date().toISOString() }],
    ...over,
  };
}

describe("publish requirements", () => {
  it("an otherwise-complete event is ready", () => {
    expect(getEventStatus(publishable()).missingRequirements).toEqual([]);
  });

  it("still demands a title — a listing with no name is not a listing", () => {
    expect(getEventStatus(publishable({ name: "   " })).missingRequirements)
      .toContain("add a title");
  });

  it("still demands a published ticket tier — buyers need something to buy", () => {
    const req = getEventStatus(publishable({
      tiers: [{ id: "t1", publishedAt: null }],
    })).missingRequirements;
    expect(req).toContain("publish at least one ticket tier");
  });

  describe("no longer required", () => {
    it("a start date", () => {
      expect(getEventStatus(publishable({ startDate: null })).missingRequirements)
        .toEqual([]);
    });

    it("an end date", () => {
      expect(getEventStatus(publishable({ endDate: null })).missingRequirements)
        .toEqual([]);
    });

    it("any dates at all", () => {
      expect(getEventStatus(publishable({ startDate: null, endDate: null })).missingRequirements)
        .toEqual([]);
    });

    it("a location — 'venue to be announced' is a real listing", () => {
      const req = getEventStatus(publishable({
        physicalLocation: null, onlineUrl: null,
      })).missingRequirements;
      expect(req).toEqual([]);
    });

    it("a start date in the future", () => {
      // This one punished a host for drafting slowly: an event written over a
      // fortnight could become unpublishable because the date they first
      // typed had gone by.
      const past = new Date(Date.now() - 10 * 86400000);
      const req = getEventStatus(publishable({
        startDate: past.toISOString(),
        endDate: new Date(past.getTime() + 2 * 3600_000).toISOString(),
      })).missingRequirements;
      expect(req).toEqual([]);
    });
  });

  describe("the one date rule that remains, as a backstop", () => {
    it("flags an end date that falls before the start", () => {
      const start = future(30);
      const req = getEventStatus(publishable({
        startDate: start.toISOString(),
        endDate: new Date(start.getTime() - 3600_000).toISOString(),
      })).missingRequirements;
      expect(req).toContain("fix the end date, which is before the start");
    });

    it("cannot fire when a date is missing, so it re-imposes nothing", () => {
      // The whole point of keeping it: guarded on BOTH dates existing.
      expect(getEventStatus(publishable({ endDate: null })).missingRequirements).toEqual([]);
      expect(getEventStatus(publishable({ startDate: null })).missingRequirements).toEqual([]);
    });
  });
});
