import { describe, it, expect } from "vitest";
import { tierPrice, tierHasForm } from "../page/tierFacts";

describe("tierFacts", () => {
  it("reads the event read's `product` and the raw `products`", () => {
    expect(tierPrice({ product: { price: 3000, currency: "EUR" } })).toEqual({ minor: 3000, currency: "EUR" });
    expect(tierPrice({ products: { price: 500, currency: "GBP" } })).toEqual({ minor: 500, currency: "GBP" });
    expect(tierPrice({})).toEqual({ minor: 0, currency: "EUR" });
  });

  it("prefers the hasForm flag, then the raw relation in either form", () => {
    expect(tierHasForm({ hasForm: true })).toBe(true);
    expect(tierHasForm({ hasForm: false, tier_forms: { id: "f" } })).toBe(false);
    expect(tierHasForm({ tier_forms: { id: "f", isActive: true } })).toBe(true);
    expect(tierHasForm({ tier_forms: { id: "f", isActive: false } })).toBe(false);
    expect(tierHasForm({ tier_forms: [{ id: "f" }] })).toBe(true);
    expect(tierHasForm({ formId: "f" })).toBe(true);
    expect(tierHasForm({})).toBe(false);
  });
});
