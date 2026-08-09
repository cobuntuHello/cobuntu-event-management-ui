import { describe, it, expect } from "vitest";
import { draftTiersToCreatePayload, blankTier } from "../components/PriceEditModal/helpers";
import type { DraftTier } from "../components/PriceEditModal/types";

/**
 * What actually reaches the backend when an event is created with tiers.
 *
 * Found 2026-08-09 auditing the create payloads after the photo-upload bug:
 * a host could set up pay-what-you-want or an installment plan in the tier
 * modal, see the modal show it back correctly, and lose the whole thing on
 * submit. The backend accepts both — the loss was entirely frontend, across
 * two separate field allowlists (TierItem in EventForm, and a hand-rolled
 * mapping in the consuming app).
 *
 * This helper is the single mapping now. Everything below is a field that was
 * silently dropped before it existed.
 */

function draft(overrides: Partial<DraftTier> = {}): DraftTier {
  return { ...blankTier("EUR", 1), name: "General", price: "20", ...overrides } as DraftTier;
}

describe("draftTiersToCreatePayload (events)", () => {
  it("carries the basics", () => {
    const [row] = draftTiersToCreatePayload([draft({ capacity: "40", description: " Front row " })]);

    expect(row).toMatchObject({
      name: "General",
      description: "Front row",
      price: 20,
      currency: "EUR",
      capacity: 40,
    });
  });

  it("carries pay-what-you-want, converted to the smallest unit", () => {
    // pwywMin is a display-units string in the form; the backend column is a
    // smallest-unit integer. Sending 10 instead of 1000 would set a 10-cent
    // floor on a €10 minimum.
    const [row] = draftTiersToCreatePayload([draft({ priceMode: "pwyw", pwywMin: "10" })]);

    expect(row.priceMode).toBe("pwyw");
    expect(row.pwywMinAmount).toBe(1000);
  });

  it("carries an installment plan, converted to the smallest unit", () => {
    const [row] = draftTiersToCreatePayload([
      draft({
        installmentEnabled: true,
        installmentTotal: "120",
        installmentCount: "3",
        installmentInterval: "1",
      }),
    ]);

    expect(row.installmentTotalPrice).toBe(12000);
    expect(row.installmentCount).toBe(3);
    expect(row.installmentIntervalMonths).toBe(1);
  });

  it("omits installment fields entirely when the plan is off", () => {
    // The three-or-none validator rejects a partial plan, so sending zeros or
    // nulls on a tier that has no plan would 400 the whole create.
    const [row] = draftTiersToCreatePayload([draft({ installmentEnabled: false })]);

    expect(row).not.toHaveProperty("installmentTotalPrice");
    expect(row).not.toHaveProperty("installmentCount");
    expect(row).not.toHaveProperty("installmentIntervalMonths");
  });

  it("carries a staged registration form, and omits an empty one", () => {
    const withForm = draftTiersToCreatePayload([
      draft({ draftForm: { fields: [{ id: "q1", label: "Why?", type: "text" }] } as any }),
    ]);
    expect(withForm[0]!.form).toBeTruthy();

    // An empty form would gate registration behind a form with no questions.
    const empty = draftTiersToCreatePayload([draft({ draftForm: { fields: [] } as any })]);
    expect(empty[0]).not.toHaveProperty("form");
  });

  it("passes publish state through, including an explicit draft", () => {
    const when = new Date().toISOString();
    expect(draftTiersToCreatePayload([draft({ publishedAt: when })])[0]!.publishedAt).toBe(when);
    // null is meaningful — the publish switch, off.
    expect(draftTiersToCreatePayload([draft({ publishedAt: null })])[0]!.publishedAt).toBeNull();
  });

  it("does NOT send a sales window", () => {
    // Deliberate: EventTierHelpers.createTier never writes autoScheduleEnabled
    // / salesStartAt / salesEndAt, so sending them would be silently ignored.
    // Pinned so nobody "helpfully" adds them and assumes they persist.
    const [row] = draftTiersToCreatePayload([
      draft({ autoScheduleEnabled: true, salesStartAt: "2026-09-01T10:00", salesEndAt: "2026-09-30T10:00" }),
    ]);

    expect(row).not.toHaveProperty("salesStartAt");
    expect(row).not.toHaveProperty("salesEndAt");
    expect(row).not.toHaveProperty("autoScheduleEnabled");
  });

  it("skips deleted and unnamed tiers", () => {
    const rows = draftTiersToCreatePayload([
      draft({ name: "Keep" }),
      draft({ name: "Gone", deleted: true }),
      draft({ name: "   " }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Keep");
  });
});
