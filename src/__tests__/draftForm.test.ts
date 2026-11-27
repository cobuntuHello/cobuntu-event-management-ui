/**
 * The event wizard's whole form, as a draft stores it (draftForm.ts; backend
 * events.draftForm). A draft used to keep a name and a description only, so a
 * host who came back found the dates, places, tickets, prices and photos gone
 * (Impact Hub Porto, 2026-11-26).
 */
import { describe, it, expect } from "vitest";
import { serializeDraftForm, readDraftForm, DRAFT_FORM_VERSION } from "../create-wizard/draftForm";
import { eventDraftToForm } from "../create-wizard/draftResume";

const START = new Date("2026-12-11T12:30:00.000Z");
const END = new Date("2026-12-11T16:00:00.000Z");

const FORM: any = {
  name: "Food for Thought #2",
  description: "Storytelling talks, lunch and coworking.",
  categoryId: "cat-1",
  subCategoryId: null,
  bannerUrl: "https://storage.example/events/cover.jpg",
  media: ["https://storage.example/events/second.jpg", "data:image/jpeg;base64,AAAA", "blob:https://x/1"],
  startDate: START,
  endDate: END,
  startTime: "12:30",
  endTime: "16:00",
  timezone: "Europe/Lisbon",
  physicalLocation: "Rua das Estrelas 143, 4150-762 Porto",
  onlineUrl: "",
  locations: [{ kind: "PHYSICAL", address: "Rua das Estrelas 143, 4150-762 Porto", latitude: 41.15, longitude: -8.64, isPrimary: true }],
  accessibility: "PUBLIC",
  requiresApproval: false,
  listed: true,
  viewTierIds: [],
  buyTierIds: [],
  tiers: [{ localId: "t1", name: "Padrão", description: "Talks, lunch, coworking", price: "30", currency: "EUR", capacity: "60", isRecurring: false, recurringInterval: "monthly" }],
  tags: [{ id: "tag-1", name: "storytelling" }],
  valueLines: [{ label: "Lunch", value: 1200 }],
  memberPricingError: "derived, never stored",
};

const ACCESS = { mode: "public", tierIds: [] } as any;

describe("serializeDraftForm", () => {
  it("keeps the whole form, with the dates as ISO strings", () => {
    const s = serializeDraftForm({ form: FORM, viewAccess: ACCESS, buyAccess: ACCESS, packageId: "pkg-1" });
    expect(s.v).toBe(DRAFT_FORM_VERSION);
    expect(s.form.startDate).toBe(START.toISOString());
    expect(s.form.endDate).toBe(END.toISOString());
    expect(s.form.tiers).toEqual(FORM.tiers);
    expect(s.form.locations).toEqual(FORM.locations);
    expect(s.form.tags).toEqual(FORM.tags);
    expect(s.form.valueLines).toEqual(FORM.valueLines);
    expect(s.packageId).toBe("pkg-1");
    expect(s.viewAccess).toEqual(ACCESS);
  });

  it("keeps uploaded photos and drops inline ones, which would exceed the size cap", () => {
    const s = serializeDraftForm({ form: FORM, viewAccess: ACCESS, buyAccess: ACCESS, packageId: null });
    expect(s.form.bannerUrl).toBe("https://storage.example/events/cover.jpg");
    expect(s.form.media).toEqual(["https://storage.example/events/second.jpg"]);

    const inline = serializeDraftForm({ form: { ...FORM, bannerUrl: "data:image/png;base64,QUJD" }, viewAccess: ACCESS, buyAccess: ACCESS, packageId: null });
    expect(inline.form.bannerUrl).toBe("");
  });

  it("leaves out what the form derives (memberPricingError)", () => {
    const s = serializeDraftForm({ form: FORM, viewAccess: ACCESS, buyAccess: ACCESS, packageId: null });
    expect(s.form).not.toHaveProperty("memberPricingError");
  });

  it("is plain JSON: nothing unserialisable reaches the request body", () => {
    const s = serializeDraftForm({ form: { ...FORM, file: new Blob(["x"]), fn: () => 1 } as any, viewAccess: ACCESS, buyAccess: ACCESS, packageId: null });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(s.form).not.toHaveProperty("fn");
  });
});

describe("readDraftForm", () => {
  it("round-trips: the dates come back as Dates, the rest as written", () => {
    const stored = JSON.parse(JSON.stringify(serializeDraftForm({ form: FORM, viewAccess: ACCESS, buyAccess: ACCESS, packageId: "pkg-1" })));
    const r = readDraftForm({ draftForm: stored })!;
    expect(r.form.startDate).toEqual(START);
    expect(r.form.endDate).toEqual(END);
    expect(r.form.tiers).toEqual(FORM.tiers);
    expect(r.packageId).toBe("pkg-1");
    expect(r.viewAccess).toEqual(ACCESS);
  });

  it("returns null for no form, another version, or a malformed one", () => {
    expect(readDraftForm({})).toBeNull();
    expect(readDraftForm({ draftForm: null })).toBeNull();
    expect(readDraftForm(null)).toBeNull();
    expect(readDraftForm({ draftForm: { v: 99, form: {} } })).toBeNull();
    expect(readDraftForm({ draftForm: { v: DRAFT_FORM_VERSION, form: [] } })).toBeNull();
    expect(readDraftForm({ draftForm: "nope" })).toBeNull();
  });

  it("an unreadable date resumes as no date rather than Invalid Date", () => {
    const r = readDraftForm({ draftForm: { v: DRAFT_FORM_VERSION, form: { startDate: "not a date", endDate: 7 } } })!;
    expect(r.form.startDate).toBeNull();
    expect(r.form.endDate).toBeNull();
  });
});

describe("eventDraftToForm", () => {
  it("restores the whole form when the draft carries one", () => {
    const stored = JSON.parse(JSON.stringify(serializeDraftForm({ form: FORM, viewAccess: ACCESS, buyAccess: ACCESS, packageId: null })));
    const f = eventDraftToForm({ id: "d1", name: "Food for Thought #2", draftStep: "commerce", draftForm: stored });
    expect(f.tiers).toEqual(FORM.tiers);
    expect(f.locations).toEqual(FORM.locations);
    expect(f.bannerUrl).toBe("https://storage.example/events/cover.jpg");
    expect(f.media).toEqual(["https://storage.example/events/second.jpg"]);
    expect(f.startDate).toEqual(START);
    expect(f.startTime).toBe("12:30");
    expect(f.categoryId).toBe("cat-1");
  });

  it("falls back to the row's columns for a draft written before the whole form was saved", () => {
    const f = eventDraftToForm({ id: "d1", name: "Old draft", description: "Kept", timezone: "Europe/Lisbon", draftStep: "details" });
    expect(f.name).toBe("Old draft");
    expect(f.description).toBe("Kept");
    expect(f.tiers).toBeUndefined();
  });

  it("the row's name fills in when the stored form has none", () => {
    const f = eventDraftToForm({ id: "d1", name: "From the column", draftForm: { v: DRAFT_FORM_VERSION, form: { tiers: [] } } });
    expect(f.name).toBe("From the column");
  });
});
