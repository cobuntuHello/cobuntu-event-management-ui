/**
 * The manage page reads THIS community's listing row, not `communities[0]`.
 *
 * Premium multi-community: a Premium member's event can be carried by several
 * communities. With `communities[0]`, community B's manage page reported
 * whichever row came first, so it called the event published in B while B had
 * it paused (and named A in the hosts view).
 */
import { describe, it, expect } from "vitest";
import { storefrontListing, getEventStatus } from "../page/helpers";

const row = (tag: string, status: string, isHidden = false) => ({
  id: `ec-${tag}`, communityId: `c-${tag}`, status, isHidden,
  community: { id: `c-${tag}`, name: tag.toUpperCase(), communityTag: tag },
});

const event = (communities: any[]) => ({
  name: "Dinner", startDate: null, endDate: null, communities,
});

describe("storefrontListing", () => {
  const rows = [row("porto", "ACTIVE"), row("coimbra", "PAUSED")];

  it("picks the row of the community the page is in, case-insensitively", () => {
    expect(storefrontListing(event(rows), "Coimbra").id).toBe("ec-coimbra");
  });

  it("falls back to the first row with no tag, or no matching row", () => {
    expect(storefrontListing(event(rows)).id).toBe("ec-porto");
    expect(storefrontListing(event(rows), "lisbon").id).toBe("ec-porto");
  });

  it("reads tagLower when the row carries that instead", () => {
    const r = [{ id: "a" , community: { tagLower: "porto" } }, { id: "b", community: { tagLower: "coimbra" } }];
    expect(storefrontListing(event(r), "coimbra").id).toBe("b");
  });

  it("is undefined when nothing carries the event", () => {
    expect(storefrontListing(event([]), "porto")).toBeUndefined();
  });
});

describe("getEventStatus in the second of two communities", () => {
  const rows = [row("porto", "ACTIVE"), row("coimbra", "PAUSED")];

  it("is not published where this community has it paused", () => {
    expect(getEventStatus(event(rows), "coimbra").isPublished).toBe(false);
  });

  it("is published where this community has it live", () => {
    expect(getEventStatus(event(rows), "porto").isPublished).toBe(true);
  });

  it("keeps the old reading with no tag", () => {
    expect(getEventStatus(event(rows)).isPublished).toBe(true);
  });
});
