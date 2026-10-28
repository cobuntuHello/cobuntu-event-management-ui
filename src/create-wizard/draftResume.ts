import type { EventFormData } from "../components/EventForm";
import type { EventDraftRow } from "./types";

/**
 * Turning a stored draft back into the form that wrote it. Lifted from the
 * community app (lib/draftResume.ts, the event half).
 *
 * Fails soft field by field: a draft exists so someone does not lose work, and
 * a mapping that throws on one odd value would lose all of it. NOT restored:
 * tiers (no reverse mapping of the tier draft shape) and files (a File cannot
 * round-trip). Times are read back in the browser's zone; the form keeps the
 * timezone as its own field, so the pair stays consistent.
 */
function splitDateTime(iso: unknown): { date: Date | null; time: string | null } {
  if (typeof iso !== "string") return { date: null, time: null };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: null, time: null };
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date: d, time: `${hh}:${mm}` };
}

export function eventDraftToForm(row: EventDraftRow): Partial<EventFormData> {
  const start = splitDateTime(row.startDate);
  const end = splitDateTime(row.endDate);
  return {
    name: typeof row.name === "string" ? row.name : "",
    description: typeof row.description === "string" ? row.description : "",
    categoryId: (row.categoryId as string) ?? null,
    subCategoryId: (row.subCategoryId as string) ?? null,
    bannerUrl: typeof row.bannerUrl === "string" ? row.bannerUrl : "",
    startDate: start.date,
    endDate: end.date,
    ...(start.time ? { startTime: start.time } : {}),
    ...(end.time ? { endTime: end.time } : {}),
    ...(typeof row.timezone === "string" && row.timezone ? { timezone: row.timezone } : {}),
    physicalLocation: typeof row.physicalLocation === "string" ? row.physicalLocation : "",
    onlineUrl: typeof row.onlineUrl === "string" ? row.onlineUrl : "",
    requiresApproval: row.requiresApproval === true,
    // `!== false`, so an absent value resumes as LISTED, matching the column
    // default. `=== true` would silently unlist every draft saved before this
    // field existed (T-288).
    listed: (row as { listed?: boolean }).listed !== false,
  } as Partial<EventFormData>;
}

/**
 * Which ownership a draft was written under. Read from the row because
 * ownership decides which STEPS exist, and the stored step has to be resolved
 * against the list this person will actually see.
 */
export function draftOwnership(row: EventDraftRow): "community" | "personal" {
  return row.communityId ? "community" : "personal";
}
