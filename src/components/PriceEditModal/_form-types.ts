/**
 * Form-builder shapes for the inline FormStep + sub-flows. Ported from
 * the standalone /form page that the redesign retires.
 */

export interface FormFieldOption {
  id: string;
  label: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  required: boolean;
  options?: FormFieldOption[];
  /** Which page (0-based) the field belongs to. The backend persists this. */
  step?: number;
}

export interface Separator {
  kind: "separator";
  id: string;
  label: string;
}

export type Item = (FormField & { kind?: undefined }) | Separator;

export type FieldType =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "EMAIL"
  | "PHONE"
  | "NUMBER"
  | "URL"
  | "DROPDOWN"
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "DATE"
  | "RATING";

export const FIELD_TYPES: ReadonlyArray<{
  type: FieldType;
  label: string;
  desc: string;
}> = [
  { type: "SHORT_TEXT", label: "Short Text", desc: "Single-line text input" },
  { type: "LONG_TEXT", label: "Long Text", desc: "Multi-line text area" },
  { type: "EMAIL", label: "Email", desc: "Email address" },
  { type: "PHONE", label: "Phone", desc: "Phone number with country code" },
  { type: "NUMBER", label: "Number", desc: "Numeric input" },
  { type: "URL", label: "URL", desc: "Website link" },
  { type: "DROPDOWN", label: "Dropdown", desc: "Select from a list" },
  { type: "SINGLE_CHOICE", label: "Single Choice", desc: "Radio buttons — pick one" },
  { type: "MULTIPLE_CHOICE", label: "Multiple Choice", desc: "Checkboxes — pick many" },
  { type: "DATE", label: "Date", desc: "Date picker" },
  { type: "RATING", label: "Rating", desc: "Star or number rating" },
];

export function fieldTypeMeta(type: FieldType | string) {
  return FIELD_TYPES.find((t) => t.type === type);
}

export function isSeparator(item: Item): item is Separator {
  return (item as Separator).kind === "separator";
}

export const CHOICE_TYPES: ReadonlyArray<FieldType> = [
  "DROPDOWN",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
];

export function fieldHasOptions(type: FieldType | string): boolean {
  return CHOICE_TYPES.includes(type as FieldType);
}

/** Flatten the {items, step0Label} → {fields, stepLabels} the backend stores. */
export function itemsToPayload(
  items: Item[],
  step0Label: string,
): { fields: FormField[]; stepLabels: string[] } {
  const fields: FormField[] = [];
  const stepLabels: string[] = [step0Label];
  let currentStep = 0;
  for (const item of items) {
    if (isSeparator(item)) {
      currentStep += 1;
      stepLabels.push(item.label);
    } else {
      const { kind: _kind, ...field } = item as any;
      fields.push({ ...(field as FormField), step: currentStep });
    }
  }
  return { fields, stepLabels };
}

/** Inverse of itemsToPayload — rebuilds the ordered Item list from the
 *  flat backend shape. */
export function payloadToItems(
  fields: FormField[],
  stepLabels: string[],
): { items: Item[]; step0Label: string } {
  const byStep = new Map<number, FormField[]>();
  let maxStep = 0;
  for (const f of fields) {
    const s = f.step ?? 0;
    if (s > maxStep) maxStep = s;
    if (!byStep.has(s)) byStep.set(s, []);
    byStep.get(s)!.push(f);
  }
  const items: Item[] = [];
  for (const f of byStep.get(0) ?? []) items.push(f as Item);
  for (let s = 1; s <= maxStep; s++) {
    items.push({
      kind: "separator",
      id: `sep-${s}-${Math.random().toString(36).slice(2, 9)}`,
      label: stepLabels[s] ?? "",
    });
    for (const f of byStep.get(s) ?? []) items.push(f as Item);
  }
  return { items, step0Label: stepLabels[0] ?? "" };
}

export function makeBlankField(type: FieldType): FormField {
  return {
    id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    label: fieldTypeMeta(type)?.label || "Field",
    required: type === "EMAIL",
    options: fieldHasOptions(type)
      ? [
          { id: "opt-1", label: "Option 1" },
          { id: "opt-2", label: "Option 2" },
        ]
      : undefined,
  };
}

export function makeBlankSeparator(label: string): Separator {
  return {
    kind: "separator",
    id: `sep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label,
  };
}
