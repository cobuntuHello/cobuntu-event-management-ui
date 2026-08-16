/**
 * Every view that can WRITE must consult the read-only gate.
 *
 * ── Why this test exists ────────────────────────────────────────────────────
 *
 * The first read-only pass gated the modal openers in OverviewView and
 * AttendeesView and assumed every editing surface went through one. Two did
 * not: AgendaView edits inline off its own `editingId`, and UpdatesView opens
 * its broadcast composer directly. So a leader of a community that merely
 * CARRIES someone's event could still rewrite the host's schedule and mail
 * their attendees.
 *
 * "Gate the openers" is a sound strategy only if the openers have actually
 * been enumerated. A reviewer cannot see the omission — nothing looks wrong in
 * a file that was never touched — so the enumeration is done here instead, by
 * reading the sources.
 *
 * A new view that writes will fail this until it consults `useCanEdit`. If the
 * right answer for that view is genuinely "no gate needed", add it to
 * READ_ONLY_BY_NATURE with the reason, so the exemption is a decision on the
 * record rather than an oversight.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const VIEWS_DIR = join(__dirname, "..", "page", "views");

/**
 * Views that cannot write, and why. Each entry is a claim that gets checked:
 * if one of these grows a write, the test below fails on it.
 */
const READ_ONLY_BY_NATURE: Record<string, string> = {
  "ListingsView.tsx":
    "Renders the listing relationships and links out to the listing page; the negotiation itself lives on that page, not here.",
  "HostsView.tsx":
    "Host add/remove happens in modals that carry their own permission checks; this view only lists.",
};

/*
 * Comments are stripped before any of the checks below run.
 *
 * The products twin of this guard did NOT strip them, and it passed when the
 * gate was deleted from a view -- because the explanatory comment left behind
 * still contained the word "useCanEdit". A guard that matches its own prose is
 * worse than no guard: it reports success for a file that does nothing. This
 * one got away with it only because its comments happen not to use the word.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Signals that a file can change server state. */
function writesToServer(src: string): boolean {
  return (
    /method:\s*["'](POST|PATCH|PUT|DELETE)["']/.test(src)
    || /\.(post|patch|put|delete)\(/.test(src)
  );
}

/** Signals that a file opens an editing surface of its own. */
function opensAnEditor(src: string): boolean {
  return /set(EditingId|ComposeOpen|Modal|DrawerOpen|BannerCropOpen)\b/.test(src);
}

describe("read-only coverage across the manage views", () => {
  const files = readdirSync(VIEWS_DIR).filter((f) => f.endsWith(".tsx"));

  it("finds the views (guards against a silently empty sweep)", () => {
    // A test that enumerates nothing passes for the wrong reason.
    expect(files.length).toBeGreaterThan(3);
  });

  it.each(
    readdirSync(VIEWS_DIR).filter((f) => f.endsWith(".tsx")),
  )("%s consults the gate if it can write", (file) => {
    const src = stripComments(readFileSync(join(VIEWS_DIR, file), "utf8"));
    const canWrite = writesToServer(src) || opensAnEditor(src);
    const exempt = file in READ_ONLY_BY_NATURE;

    if (!canWrite) {
      // An exemption that is no longer needed should be removed, but an
      // unnecessary entry is harmless — the claim is still true.
      return;
    }

    if (exempt) {
      throw new Error(
        `${file} is listed in READ_ONLY_BY_NATURE ("${READ_ONLY_BY_NATURE[file]}") `
        + `but it now writes or opens an editor. Remove the exemption and gate it.`,
      );
    }

    expect(
      /useCanEdit\s*\(/.test(src),
      `${file} can write but never calls useCanEdit(). A carrying community's leader `
      + `would be able to change a host's event from this view. Gate the opener, or `
      + `add the file to READ_ONLY_BY_NATURE with the reason.`,
    ).toBe(true);
  });
});
