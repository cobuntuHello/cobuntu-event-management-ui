import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EVENT_WIZARD_MESSAGES_EN } from "../create-wizard/messages.en";

/**
 * The wizard's footer buttons speak the host's language.
 *
 * "Back", "Cancel" and "Next" were written straight into the JSX, so a
 * Portuguese host read "Etapa 1 de 6 · Próxima: Detalhes" above an English
 * "Cancel" / "Next" (Impact Hub Porto, Nov 2026). They now go through the
 * translator like every other label, with English defaults here.
 */
const src = readFileSync(join(__dirname, "..", "create-wizard", "EventCreateWizard.tsx"), "utf8");

describe("wizard footer copy", () => {
  it("has no hard-coded English labels on its buttons", () => {
    const literal = [...src.matchAll(/<WizardButton\b[^>]*>\s*([A-Za-z][^<{]*?)\s*<\/WizardButton>/g)].map((m) => m[1]);
    expect(literal).toEqual([]);
  });

  it("asks the translator for Back, Cancel and Next, with English defaults", () => {
    for (const k of ["back", "cancel", "next"]) expect(src).toContain(`t("${k}")`);
    const block = (EVENT_WIZARD_MESSAGES_EN as any).eventsUi.createEventClient;
    expect([block.back, block.cancel, block.next]).toEqual(["Back", "Cancel", "Next"]);
  });
});
