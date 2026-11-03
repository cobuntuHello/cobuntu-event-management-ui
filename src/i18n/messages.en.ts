import { PRICING_MESSAGES_EN } from "./messages/pricing";
import { FORM_MESSAGES_EN } from "./messages/form";
import { OVERVIEW_MESSAGES_EN } from "./messages/overview";
import { PEOPLE_MESSAGES_EN } from "./messages/people";
import { CORE_MESSAGES_EN } from "./messages/core";

/**
 * English copy for everything the package renders OUTSIDE the create wizard:
 * the manage page and its views, the edit modals, the event form, the pricing
 * modal, attendees, hosts, listings and activity.
 *
 * Same contract as the wizard's EVENT_WIZARD_MESSAGES_EN: every string is asked
 * for by its FULLY QUALIFIED key ("eventsUi.manageUi.agendaView.title"), the key
 * the community app's messages/en.json carries. A host that passes a translator
 * (EventManagementConfig.t, or the wizard's copy.t) resolves the key in its own
 * locale; a host that passes nothing gets these English defaults.
 *
 * One file per area so the areas can be edited independently; they are merged
 * here into one tree. Area files never share a component namespace.
 */
function merge(...trees: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const tree of trees) {
    if (!tree || typeof tree !== "object") continue;
    for (const [k, v] of Object.entries(tree as Record<string, unknown>)) {
      const prev = out[k];
      out[k] =
        v && typeof v === "object" && prev && typeof prev === "object"
          ? merge(prev, v)
          : v;
    }
  }
  return out;
}

export const EVENT_MANAGEMENT_MESSAGES_EN = merge(
  PRICING_MESSAGES_EN,
  FORM_MESSAGES_EN,
  OVERVIEW_MESSAGES_EN,
  PEOPLE_MESSAGES_EN,
  CORE_MESSAGES_EN,
) as {
  eventsUi: { manageUi: Record<string, Record<string, string>> };
};

/** Every fully qualified key in a message tree, e.g. for a host's parity test. */
export function flattenMessageKeys(tree: unknown, prefix = ""): string[] {
  if (!tree || typeof tree !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(tree as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.push(key);
    else out.push(...flattenMessageKeys(v, key));
  }
  return out;
}
