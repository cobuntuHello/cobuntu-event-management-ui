/**
 * One form answer as plain text, for the attendees CSV.
 *
 * Choice answers are stored as option ids ("opt-1"); the export used to write
 * those ids instead of what the attendee picked. Ids are mapped to their option
 * labels here, falling back to the raw id when an option has since been
 * removed from the form.
 */
export interface AnswerField {
  id: string;
  type?: string;
  options?: Array<{ id: string; label: string }>;
}

export function answerText(field: AnswerField | undefined, value: unknown): string {
  if (value == null || value === "") return "";
  const label = (v: unknown) =>
    field?.options?.find((o) => o.id === v)?.label ?? String(v);
  if (Array.isArray(value)) return value.map(label).join(", ");
  return field?.options?.length ? label(value) : String(value);
}
