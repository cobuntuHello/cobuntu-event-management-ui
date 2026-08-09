import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import * as path from "path";

/**
 * Every portalled popover must sit ABOVE the modal that opens it.
 *
 * ModalShell (@cobuntu/management-ui-shared) moved from z-50 to z-[120] on
 * 2026-08-08 so its backdrop would cover the community app's sidebar. The
 * popovers in THIS package were left behind at z-50 and z-[80], so the currency
 * dropdown and every ⓘ tooltip in the tier modal stopped appearing — they were
 * rendering, just underneath. Reported 2026-08-09 as "the dropdown doesn't open
 * anything" and "the ? tooltip doesn't show anything".
 *
 * Nothing connected the two numbers, and neither file could see the other. This
 * asserts the relationship directly, by reading the source, so raising one
 * without the other fails here instead of in someone's browser.
 *
 * Deliberately a >= comparison rather than exact values: the point is the
 * ORDERING, and pinning literals would just move the silent breakage to
 * whoever next needs a different number.
 */

const ROOT = path.resolve(__dirname, "../..");
const MODAL_SHELL_Z = 120;   // @cobuntu/management-ui-shared ModalShell backdrop

function zOf(relPath: string, marker: RegExp): number | null {
  const full = path.join(ROOT, relPath);
  if (!existsSync(full)) return null;
  const line = readFileSync(full, "utf8").split("\n").find((l) => marker.test(l));
  if (!line) return null;
  const m = /z-\[(\d+)\]|z-(\d+)/.exec(line);
  return m ? parseInt(m[1] ?? m[2]!, 10) : null;
}

describe("stacking ladder", () => {
  it("the Select dropdown clears the modal backdrop", () => {
    const z = zOf("src/ui/select.tsx", /relative z-/);
    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(MODAL_SHELL_Z);
  });

  it("the ⓘ HelpTip clears the modal backdrop", () => {
    const z = zOf("src/components/PriceEditModal/_primitives.tsx", /max-w-\[240px\]/);
    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(MODAL_SHELL_Z);
  });

  it("the Popover clears the modal backdrop", () => {
    // Events has a standalone popover the products package does not.
    const z = zOf("src/ui/popover.tsx", /z-\[|z-\d/);
    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(MODAL_SHELL_Z);
  });

  it("a Dialog opened from inside a modal clears it too", () => {
    // Lower than the Select band on purpose: a Select inside a Dialog has to
    // beat the Dialog, so they cannot share a level.
    const z = zOf("src/ui/dialog.tsx", /fixed inset-0/);
    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(MODAL_SHELL_Z);
    expect(z!).toBeLessThan(zOf("src/ui/select.tsx", /relative z-/)!);
  });
});
