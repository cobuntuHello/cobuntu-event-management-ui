/**
 * Step identity and copy for the tier modal's Level-3 screens.
 *
 * These lived in TierHubView.tsx, alongside a component nothing rendered. The
 * component was the pre-redesign tile menu, replaced by TierEditView; only its
 * constants were still imported, so the file survived purely as their home
 * while carrying a stale `disabled={!t.id}` gate on its Registration form
 * tile — the very gate that had to be fixed in the live view when forms became
 * reachable on unsaved tiers. Keeping dead UI around with an out-of-date rule
 * in it is how that rule gets copied back in by someone re-wiring it.
 */
export type StepId = "details" | "basics" | "capacity" | "config" | "form";

/** Step metadata — shared by the modal header (breadcrumb + title +
 *  subtitle) and the hub tiles so they never drift. */
export const STEP_TITLES: Record<StepId, string> = {
  details: "Details",
  basics: "Pricing configuration",
  capacity: "Capacity",
  config: "Sales window",
  form: "Registration form",
};

export const STEP_SUBTITLES: Record<StepId, string> = {
  details: "Name, description, and attendance capacity for this tier.",
  basics: "Price, billing, and member discounts.",
  capacity: "Cap how many of this tier can be sold. Leave blank for unlimited.",
  config: "Set the timeframe this tier is available for sale.",
  form: "Attach a form buyers complete when they register.",
};
