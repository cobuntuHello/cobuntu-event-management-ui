import { describe, it, expect } from "vitest";
import {
  buildDonationBody,
  buildTierBody,
  findTiersWithMaterialChanges,
  fromSmallestUnit,
  getSymbol,
  hasPaidTier,
  isTierLocked,
  loadDonationFromEvent,
  toDisplay,
  toSmallestUnit,
  validateDonation,
  validateTier,
  blankTier,
  blankDonation,
} from "../components/PriceEditModal/helpers";

describe("PriceEditModal helpers — currency conversion", () => {
  it("toSmallestUnit/toDisplay roundtrip for fractional currencies", () => {
    expect(toSmallestUnit(20, "EUR")).toBe(2000);
    expect(toDisplay(2000, "EUR")).toBe(20);
    expect(toSmallestUnit(19.99, "USD")).toBe(1999);
  });

  it("treats JPY as zero-decimal", () => {
    expect(toSmallestUnit(2000, "JPY")).toBe(2000);
    expect(toDisplay(2000, "JPY")).toBe(2000);
  });

  it("fromSmallestUnit handles null/undefined → empty string", () => {
    expect(fromSmallestUnit(null, "EUR")).toBe("");
    expect(fromSmallestUnit(undefined, "EUR")).toBe("");
    expect(fromSmallestUnit(2000, "EUR")).toBe("20");
    expect(fromSmallestUnit(2000, "JPY")).toBe("2000");
  });

  it("getSymbol returns the currency code as fallback for unknown currencies", () => {
    expect(getSymbol("EUR")).toBe("€");
    expect(getSymbol("XXX")).toBe("XXX");
  });
});

describe("PriceEditModal helpers — validateTier", () => {
  it("rejects blank name", () => {
    expect(
      validateTier({ ...blankTier(), name: "  " }),
    ).toMatch(/Tier name is required/);
  });

  it("rejects blank or NaN price", () => {
    expect(
      validateTier({ ...blankTier(), name: "Standard", price: "" }),
    ).toMatch(/Price required/);
    expect(
      validateTier({ ...blankTier(), name: "Standard", price: "abc" }),
    ).toMatch(/Price required/);
  });

  it("accepts zero price (free tier)", () => {
    expect(
      validateTier({ ...blankTier(), name: "Free", price: "0" }),
    ).toBeNull();
  });

  it("rejects negative pwyw minimum", () => {
    expect(
      validateTier({
        ...blankTier(),
        name: "PWYW",
        price: "10",
        priceMode: "pwyw",
        pwywMin: "-5",
      }),
    ).toMatch(/non-negative/);
  });

  it("enforces installment three-or-none — count must be ≥ 2", () => {
    expect(
      validateTier({
        ...blankTier(),
        name: "Std",
        price: "100",
        installmentEnabled: true,
        installmentTotal: "300",
        installmentCount: "1",
        installmentInterval: "1",
      }),
    ).toMatch(/at least 2/);
  });

  it("enforces installment three-or-none — interval must be ≥ 1", () => {
    expect(
      validateTier({
        ...blankTier(),
        name: "Std",
        price: "100",
        installmentEnabled: true,
        installmentTotal: "300",
        installmentCount: "3",
        installmentInterval: "0",
      }),
    ).toMatch(/at least 1 month/);
  });

  it("enforces installment total > 0", () => {
    expect(
      validateTier({
        ...blankTier(),
        name: "Std",
        price: "100",
        installmentEnabled: true,
        installmentTotal: "0",
        installmentCount: "3",
        installmentInterval: "1",
      }),
    ).toMatch(/positive number/);
  });

  it("accepts a fully valid installment plan", () => {
    expect(
      validateTier({
        ...blankTier(),
        name: "Std",
        price: "100",
        installmentEnabled: true,
        installmentTotal: "300",
        installmentCount: "3",
        installmentInterval: "1",
      }),
    ).toBeNull();
  });
});

describe("PriceEditModal helpers — validateDonation", () => {
  it("returns null when donation is disabled", () => {
    expect(validateDonation(blankDonation())).toBeNull();
  });

  it("rejects blank entries in fixed mode", () => {
    expect(
      validateDonation({
        ...blankDonation(),
        enabled: true,
        amounts: ["5", "", "25"],
      }),
    ).toMatch(/blank/);
  });

  it("rejects non-positive amounts in fixed mode", () => {
    expect(
      validateDonation({
        ...blankDonation(),
        enabled: true,
        amounts: ["5", "-3", "25"],
      }),
    ).toMatch(/positive number/);
  });

  it("accepts pwyw with no minimum", () => {
    expect(
      validateDonation({
        ...blankDonation(),
        enabled: true,
        mode: "pwyw",
        minAmount: "",
      }),
    ).toBeNull();
  });

  it("rejects negative pwyw minimum", () => {
    expect(
      validateDonation({
        ...blankDonation(),
        enabled: true,
        mode: "pwyw",
        minAmount: "-1",
      }),
    ).toMatch(/non-negative/);
  });
});

describe("PriceEditModal helpers — loadDonationFromEvent", () => {
  it("returns blank when donationConfig is missing", () => {
    expect(loadDonationFromEvent({ currency: "USD" })).toMatchObject({
      enabled: false,
      currency: "USD",
      amounts: ["5", "10", "25"],
    });
  });

  it("converts smallest-unit amounts to display unit", () => {
    const d = loadDonationFromEvent({
      donationConfig: {
        enabled: true,
        mode: "fixed",
        amounts: [500, 1000, 2500],
        currency: "EUR",
      },
    });
    expect(d.amounts).toEqual(["5", "10", "25"]);
    expect(d.currency).toBe("EUR");
    expect(d.enabled).toBe(true);
  });

  it("handles pwyw minimum conversion", () => {
    const d = loadDonationFromEvent({
      donationConfig: {
        enabled: true,
        mode: "pwyw",
        minAmount: 500,
        currency: "EUR",
      },
    });
    expect(d.mode).toBe("pwyw");
    expect(d.minAmount).toBe("5");
  });
});

describe("PriceEditModal helpers — buildTierBody", () => {
  it("includes price + currency + priceMode for unlocked tiers", () => {
    const body = buildTierBody({
      ...blankTier(),
      name: "Std",
      price: "20",
      currency: "EUR",
      priceMode: "fixed",
    });
    expect(body).toMatchObject({
      name: "Std",
      price: 20,
      currency: "EUR",
      priceMode: "fixed",
    });
  });

  it("omits price/currency/priceMode when tier is locked", () => {
    const body = buildTierBody({
      ...blankTier(),
      id: "tier-1",
      salesCount: 5,
      name: "Std",
      price: "20",
      currency: "EUR",
    });
    expect(body).not.toHaveProperty("price");
    expect(body).not.toHaveProperty("currency");
    expect(body).not.toHaveProperty("priceMode");
    expect(body).not.toHaveProperty("installmentTotalPrice");
  });

  it("serializes installment trio in smallest units", () => {
    const body = buildTierBody({
      ...blankTier(),
      name: "Std",
      price: "100",
      currency: "EUR",
      installmentEnabled: true,
      installmentTotal: "300",
      installmentCount: "3",
      installmentInterval: "1",
    });
    expect(body).toMatchObject({
      installmentTotalPrice: 30000,
      installmentCount: 3,
      installmentIntervalMonths: 1,
    });
  });

  it("nulls the installment trio when disabled (unlocked)", () => {
    const body = buildTierBody({
      ...blankTier(),
      name: "Std",
      price: "100",
      currency: "EUR",
      installmentEnabled: false,
    });
    expect(body).toMatchObject({
      installmentTotalPrice: null,
      installmentCount: null,
      installmentIntervalMonths: null,
    });
  });

  it("threads copyFormFromTierId on duplicated new tier", () => {
    const body = buildTierBody({
      ...blankTier(),
      name: "Std (copy)",
      price: "20",
      sourceTierId: "tier-src",
    });
    expect(body).toMatchObject({ copyFormFromTierId: "tier-src" });
  });

  it("does NOT send copyFormFromTierId for an already-saved tier", () => {
    const body = buildTierBody({
      ...blankTier(),
      id: "tier-1",
      name: "Std",
      price: "20",
      sourceTierId: "tier-src",
    });
    expect(body).not.toHaveProperty("copyFormFromTierId");
  });

  it("includes notifyAttendees only when requested", () => {
    expect(
      buildTierBody({ ...blankTier(), name: "Std", price: "20" }),
    ).not.toHaveProperty("notifyAttendees");
    expect(
      buildTierBody(
        { ...blankTier(), name: "Std", price: "20" },
        { notifyAttendees: true },
      ),
    ).toMatchObject({ notifyAttendees: true });
  });

  // Publish + auto-schedule round-trip (feat/event-tier-publish-and-schedule).
  describe("publish + auto-schedule fields", () => {
    it("blankTier is published by default with no window", () => {
      const t = blankTier();
      expect(t.publishedAt).toBeTruthy();
      expect(t.autoScheduleEnabled).toBe(false);
      expect(t.salesStartAt).toBe("");
      expect(t.salesEndAt).toBe("");
    });

    it("buildTierBody sends publishedAt as ISO when set; null when unset", () => {
      const publishedAt = new Date("2026-06-01T12:00:00.000Z").toISOString();
      const published = buildTierBody({
        ...blankTier(), name: "Std", price: "20", publishedAt,
      });
      expect(published).toMatchObject({ publishedAt });

      const drafted = buildTierBody({
        ...blankTier(), name: "Std", price: "20", publishedAt: null,
      });
      expect(drafted).toMatchObject({ publishedAt: null });
    });

    it("buildTierBody nulls sales window when autoScheduleEnabled is off, even if dates are present", () => {
      const body = buildTierBody({
        ...blankTier(),
        name: "Std", price: "20",
        publishedAt: new Date().toISOString(),
        autoScheduleEnabled: false,
        salesStartAt: "2026-06-01T12:00:00.000Z",
        salesEndAt: "2026-06-05T12:00:00.000Z",
      });
      expect(body).toMatchObject({
        autoScheduleEnabled: false,
        salesStartAt: null,
        salesEndAt: null,
      });
    });

    it("buildTierBody sends sales window as ISO strings when autoScheduleEnabled is on", () => {
      const start = "2026-06-01T12:00:00.000Z";
      const end = "2026-06-05T12:00:00.000Z";
      const body = buildTierBody({
        ...blankTier(),
        name: "Std", price: "20",
        publishedAt: new Date().toISOString(),
        autoScheduleEnabled: true,
        salesStartAt: start,
        salesEndAt: end,
      });
      expect(body).toMatchObject({
        autoScheduleEnabled: true,
        salesStartAt: start,
        salesEndAt: end,
      });
    });

    it("buildTierBody sends null for empty window inputs even when autoScheduleEnabled is on", () => {
      const body = buildTierBody({
        ...blankTier(),
        name: "Std", price: "20",
        publishedAt: new Date().toISOString(),
        autoScheduleEnabled: true,
        salesStartAt: "",
        salesEndAt: "",
      });
      expect(body).toMatchObject({
        autoScheduleEnabled: true,
        salesStartAt: null,
        salesEndAt: null,
      });
    });
  });
});

describe("PriceEditModal helpers — buildDonationBody", () => {
  it("returns null when donation is disabled", () => {
    expect(buildDonationBody(blankDonation(), "EUR")).toBeNull();
  });

  it("serializes fixed amounts in smallest units, filtering invalids", () => {
    const body = buildDonationBody(
      {
        ...blankDonation(),
        enabled: true,
        amounts: ["5", "abc", "0", "25"],
        currency: "EUR",
      },
      "EUR",
    );
    expect(body).toMatchObject({
      enabled: true,
      mode: "fixed",
      currency: "EUR",
      amounts: [500, 2500],
    });
  });

  it("serializes pwyw minimum in smallest units", () => {
    const body = buildDonationBody(
      {
        ...blankDonation(),
        enabled: true,
        mode: "pwyw",
        minAmount: "5",
        currency: "EUR",
      },
      "EUR",
    );
    expect(body).toMatchObject({ mode: "pwyw", minAmount: 500 });
  });

  it("includes a trimmed label only when non-empty", () => {
    const body = buildDonationBody(
      {
        ...blankDonation(),
        enabled: true,
        label: "  Help us thrive  ",
        currency: "EUR",
      },
      "EUR",
    );
    expect(body).toMatchObject({ label: "Help us thrive" });
  });
});

describe("PriceEditModal helpers — isTierLocked, hasPaidTier", () => {
  it("isTierLocked is false for brand-new (no id) tiers", () => {
    expect(isTierLocked({ ...blankTier(), salesCount: 10 })).toBe(false);
  });

  it("isTierLocked is true only when saved AND has sales", () => {
    expect(
      isTierLocked({ ...blankTier(), id: "t1", salesCount: 0 }),
    ).toBe(false);
    expect(
      isTierLocked({ ...blankTier(), id: "t1", salesCount: 1 }),
    ).toBe(true);
  });

  it("hasPaidTier ignores deleted drafts", () => {
    expect(
      hasPaidTier([
        { ...blankTier(), name: "A", price: "10", deleted: true },
        { ...blankTier(), name: "B", price: "0" },
      ]),
    ).toBe(false);
  });

  it("hasPaidTier returns true when any visible draft has price > 0", () => {
    expect(
      hasPaidTier([
        { ...blankTier(), name: "A", price: "0" },
        { ...blankTier(), name: "B", price: "10" },
      ]),
    ).toBe(true);
  });
});

describe("PriceEditModal helpers — findTiersWithMaterialChanges", () => {
  it("returns tiers whose name or price changed", () => {
    const snap = new Map([
      ["t1", { name: "Old", price: "10", currency: "EUR" }],
      ["t2", { name: "Same", price: "20", currency: "EUR" }],
    ]);
    const drafts = [
      { ...blankTier(), id: "t1", name: "New", price: "10", currency: "EUR" },
      { ...blankTier(), id: "t2", name: "Same", price: "20", currency: "EUR" },
      { ...blankTier(), id: "t3", name: "Brand new", price: "30", currency: "EUR" },
    ];
    const changed = findTiersWithMaterialChanges(drafts, snap);
    expect(changed).toHaveLength(1);
    expect(changed[0].id).toBe("t1");
  });

  it("ignores brand-new tiers (no id)", () => {
    const snap = new Map();
    const drafts = [
      { ...blankTier(), name: "Fresh", price: "10" },
    ];
    expect(findTiersWithMaterialChanges(drafts, snap)).toHaveLength(0);
  });

  it("ignores deleted tiers", () => {
    const snap = new Map([
      ["t1", { name: "Old", price: "10", currency: "EUR" }],
    ]);
    const drafts = [
      { ...blankTier(), id: "t1", name: "New", price: "10", currency: "EUR", deleted: true },
    ];
    expect(findTiersWithMaterialChanges(drafts, snap)).toHaveLength(0);
  });
});

describe("PriceEditModal helpers — blank builders", () => {
  it("blankTier picks 'Standard' for the first tier, 'Tier N' otherwise", () => {
    expect(blankTier("EUR", 1).name).toBe("Standard");
    expect(blankTier("EUR", 2).name).toBe("Tier 2");
  });

  it("blankTier defaults to fixed pricing + monthly installment interval", () => {
    const t = blankTier();
    expect(t.priceMode).toBe("fixed");
    expect(t.installmentInterval).toBe("1");
    expect(t.installmentEnabled).toBe(false);
  });

  it("blankDonation defaults to a 5/10/25 suggested ladder", () => {
    expect(blankDonation().amounts).toEqual(["5", "10", "25"]);
  });
});
