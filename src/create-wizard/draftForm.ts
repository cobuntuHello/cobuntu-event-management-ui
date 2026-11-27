import type { TierAccessValue } from "@cobuntu/management-ui-shared";
import type { EventFormData } from "../components/EventForm";

/**
 * The event wizard's WHOLE form, as a draft stores it (backend events.draftForm).
 *
 * WHY. An autosaved draft used to carry a name, a description, a timezone and
 * the step. Dates, places, tickets and prices, the photos already uploaded and
 * who may see and buy were all lost, so a host who came back to a draft found
 * it almost empty and re-typed it (Impact Hub Porto, 2026-11-26: she also lost
 * the photo she had uploaded, and created the event without it).
 *
 * WHAT. The form's own data (EventFormData, the shape EventForm seeds from as
 * `initialData`, so restoring is handing it back), plus the wizard state that
 * lives outside the form: the access step and the chosen package. Versioned,
 * so a later shape can be read or ignored deliberately.
 *
 * WHAT IS LEFT OUT, and why:
 * - Photos that are not hosted URLs. Without an upload route the cover is an
 *   inline `data:` image; a few of those exceed the server's size cap (413),
 *   and since autosave retries quietly, one oversized photo would stop the
 *   whole draft from ever saving again. Uploaded photos are URLs and are kept.
 * - `memberPricingError`: derived by the form on every change, never input.
 */

export const DRAFT_FORM_VERSION = 1;

export interface StoredDraftForm {
  v: number;
  form: Record<string, unknown>;
  viewAccess?: TierAccessValue;
  buyAccess?: TierAccessValue;
  packageId?: string | null;
}

export interface RestoredDraftForm {
  form: Partial<EventFormData>;
  viewAccess?: TierAccessValue;
  buyAccess?: TierAccessValue;
  packageId?: string | null;
}

const isHosted = (url: unknown): url is string => typeof url === "string" && /^https?:\/\//i.test(url);

/** The snapshot autosave sends as `form`. JSON-safe: Dates become ISO strings. */
export function serializeDraftForm(input: {
  form: EventFormData;
  viewAccess: TierAccessValue;
  buyAccess: TierAccessValue;
  packageId: string | null;
}): StoredDraftForm {
  const { memberPricingError: _derived, ...form } = input.form;
  const kept: Record<string, unknown> = {
    ...form,
    bannerUrl: isHosted(form.bannerUrl) ? form.bannerUrl : "",
    ...(Array.isArray(form.media) ? { media: form.media.filter(isHosted) } : {}),
  };
  // One JSON round trip: Dates to ISO, undefined and functions dropped, and
  // nothing unserialisable (a File) reaches the request body as `{}` noise.
  const json = JSON.parse(JSON.stringify(kept)) as Record<string, unknown>;
  return {
    v: DRAFT_FORM_VERSION,
    form: json,
    viewAccess: input.viewAccess,
    buyAccess: input.buyAccess,
    packageId: input.packageId,
  };
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asAccess(value: unknown): TierAccessValue | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as { mode?: unknown; tierIds?: unknown };
  if (typeof v.mode !== "string") return undefined;
  return { ...(value as TierAccessValue), tierIds: Array.isArray(v.tierIds) ? v.tierIds.filter((x): x is string => typeof x === "string") : [] };
}

/**
 * The stored form of a draft row, or null when it has none or one this
 * version cannot read (an older draft, another shape): the wizard then
 * resumes from the row's typed columns, as before. Never throws.
 */
export function readDraftForm(row: object | null | undefined): RestoredDraftForm | null {
  // `object`, not `{ draftForm?: unknown }`: an all-optional type is a "weak
  // type" that EventDraftRow (an index signature) shares no property with.
  const stored = (row as { draftForm?: unknown } | null | undefined)?.draftForm as Partial<StoredDraftForm> | null | undefined;
  if (!stored || typeof stored !== "object" || stored.v !== DRAFT_FORM_VERSION) return null;
  if (!stored.form || typeof stored.form !== "object" || Array.isArray(stored.form)) return null;
  const f = stored.form as Record<string, unknown>;
  const form: Partial<EventFormData> = {
    ...(f as Partial<EventFormData>),
    startDate: asDate(f.startDate),
    endDate: asDate(f.endDate),
  };
  return {
    form,
    viewAccess: asAccess(stored.viewAccess),
    buyAccess: asAccess(stored.buyAccess),
    packageId: typeof stored.packageId === "string" ? stored.packageId : null,
  };
}
