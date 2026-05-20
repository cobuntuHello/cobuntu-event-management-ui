import { describe, it, expect } from "vitest";
import {
  fieldHasOptions,
  fieldTypeMeta,
  isSeparator,
  itemsToPayload,
  makeBlankField,
  makeBlankSeparator,
  payloadToItems,
  type FormField,
  type Item,
} from "../components/PriceEditModal/_form-types";

describe("FormStep helpers — type metadata", () => {
  it("fieldTypeMeta returns the label/desc for known types", () => {
    expect(fieldTypeMeta("EMAIL")?.label).toBe("Email");
    expect(fieldTypeMeta("SHORT_TEXT")?.desc).toMatch(/single-line/i);
  });

  it("fieldHasOptions is true for choice/dropdown types only", () => {
    expect(fieldHasOptions("DROPDOWN")).toBe(true);
    expect(fieldHasOptions("SINGLE_CHOICE")).toBe(true);
    expect(fieldHasOptions("MULTIPLE_CHOICE")).toBe(true);
    expect(fieldHasOptions("EMAIL")).toBe(false);
    expect(fieldHasOptions("RATING")).toBe(false);
  });

  it("isSeparator distinguishes page breaks from fields", () => {
    const sep: Item = { kind: "separator", id: "s-1", label: "Page 2" };
    const field: Item = { id: "f-1", type: "EMAIL", label: "Email", required: true };
    expect(isSeparator(sep)).toBe(true);
    expect(isSeparator(field)).toBe(false);
  });
});

describe("FormStep helpers — blank builders", () => {
  it("makeBlankField uses the type's label", () => {
    const f = makeBlankField("EMAIL");
    expect(f.label).toBe("Email");
  });

  it("makeBlankField marks EMAIL required by default", () => {
    expect(makeBlankField("EMAIL").required).toBe(true);
    expect(makeBlankField("SHORT_TEXT").required).toBe(false);
  });

  it("makeBlankField seeds two options on choice types", () => {
    expect(makeBlankField("DROPDOWN").options).toHaveLength(2);
    expect(makeBlankField("SHORT_TEXT").options).toBeUndefined();
  });

  it("makeBlankSeparator preserves the label", () => {
    expect(makeBlankSeparator("Step 2").label).toBe("Step 2");
    expect(makeBlankSeparator("").kind).toBe("separator");
  });
});

describe("FormStep helpers — roundtrip itemsToPayload / payloadToItems", () => {
  it("flattens items into fields + stepLabels", () => {
    const items: Item[] = [
      { id: "f-1", type: "SHORT_TEXT", label: "Name", required: true },
      { kind: "separator", id: "s-1", label: "Tell us more" },
      { id: "f-2", type: "EMAIL", label: "Email", required: true },
    ];
    const { fields, stepLabels } = itemsToPayload(items, "About you");
    expect(stepLabels).toEqual(["About you", "Tell us more"]);
    expect(fields).toEqual([
      { id: "f-1", type: "SHORT_TEXT", label: "Name", required: true, step: 0 },
      { id: "f-2", type: "EMAIL", label: "Email", required: true, step: 1 },
    ]);
  });

  it("rebuilds items from the flat shape", () => {
    const fields: FormField[] = [
      { id: "f-1", type: "SHORT_TEXT", label: "Name", required: true, step: 0 },
      { id: "f-2", type: "EMAIL", label: "Email", required: true, step: 1 },
    ];
    const stepLabels = ["About you", "Tell us more"];
    const { items, step0Label } = payloadToItems(fields, stepLabels);
    expect(step0Label).toBe("About you");
    // items: [field0, separator, field1]
    expect(items).toHaveLength(3);
    expect((items[0] as FormField).id).toBe("f-1");
    expect(isSeparator(items[1])).toBe(true);
    expect((items[1] as any).label).toBe("Tell us more");
    expect((items[2] as FormField).id).toBe("f-2");
  });

  it("roundtrips a single-page form (no separators)", () => {
    const items: Item[] = [
      { id: "f-1", type: "EMAIL", label: "Email", required: true },
    ];
    const { fields, stepLabels } = itemsToPayload(items, "");
    expect(stepLabels).toEqual([""]);
    expect(fields).toEqual([
      { id: "f-1", type: "EMAIL", label: "Email", required: true, step: 0 },
    ]);
    const back = payloadToItems(fields, stepLabels);
    expect(back.items).toHaveLength(1);
    expect((back.items[0] as FormField).step).toBe(0);
  });
});
