import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eventHasPaidTier, formTiersHavePaid } from "../lib/paidEvent";

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

/**
 * A free event has nothing to refund, so it gets no refund policy: not in the
 * Settings drawer and not in the create form. Any tier that costs something, or
 * is pay-what-you-want, makes it paid again.
 */
describe("when an event is paid", () => {
  it("is free when every tier is 0", () => {
    expect(eventHasPaidTier({ tiers: [{ product: { price: 0 } }, { product: { price: 0 } }] })).toBe(false);
  });
  it("is paid when any tier costs something", () => {
    expect(eventHasPaidTier({ tiers: [{ product: { price: 0 } }, { product: { price: 1500 } }] })).toBe(true);
  });
  it("counts pay-what-you-want as paid", () => {
    expect(eventHasPaidTier({ tiers: [{ product: { price: 0 }, priceMode: "pwyw" }] })).toBe(true);
  });
  it("falls back to the single ticket product when there are no tiers", () => {
    expect(eventHasPaidTier({ ticketProduct: { price: 0 } })).toBe(false);
    expect(eventHasPaidTier({ ticketProduct: { price: 500 } })).toBe(true);
    expect(eventHasPaidTier({})).toBe(false);
  });
  it("reads the create form's string prices", () => {
    expect(formTiersHavePaid([{ price: "0" }, { price: "" }])).toBe(false);
    expect(formTiersHavePaid([{ price: "0" }, { price: "12.50" }])).toBe(true);
    expect(formTiersHavePaid([{ price: "0", priceMode: "pwyw" }])).toBe(true);
  });
});

describe("the refund controls are gated on it", () => {
  it("the Settings drawer shows the refund row only for a paid event", () => {
    expect(read("../components/SettingsDrawer.tsx")).toContain("isCommunityOwned && eventHasPaidTier(event)");
  });
  it("the create form shows the refund field only when a tier can be paid", () => {
    expect(read("../components/EventForm.tsx")).toContain("formTiersHavePaid(tiers) && (");
  });
});
