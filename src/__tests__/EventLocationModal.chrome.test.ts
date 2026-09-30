/**
 * The Event Location modal's chrome, and when "primary" is worth asking about.
 *
 * Three things were reported on it:
 *
 *   1. It was a CENTRED BOX on a phone. `DialogContent` pins itself to
 *      left/top 50% with a translate, at every width -- a desktop modal shrunk,
 *      with dead space above and below, its content furthest from the thumb,
 *      and no edge to swipe. This one needs docking more than most: the address
 *      autocomplete opens a list under the field, and centred on a phone that
 *      list landed against the bottom of the viewport with the keyboard over it.
 *
 *   2. No way out at the top. The modal passed `hideClose` under the house rule
 *      that a modal carrying its own bottom actions gets no top-right X. That
 *      rule is right for a short confirm; this is a form you can open, change
 *      your mind about, and want out of without reading to the end.
 *
 *   3. "Primary" / "Make primary" appeared between two BLANK fields, because it
 *      keyed off how many rows existed rather than how many said anything.
 *
 * The layout assertions are read from source. A jsdom render cannot tell you
 * what a `sm:` variant does -- it has no viewport and applies no stylesheet --
 * so a render test here would assert the classnames anyway, with more
 * machinery and the same evidence. `locationHasContent` is real logic and is
 * tested as such.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { locationHasContent, makeLocation } from "../ui/event-locations-field";

const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
/** Comments discuss every one of these classes at length. */
const code = (p: string) =>
  src(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the dialog can dock to the bottom edge on a phone", () => {
  const dialog = code("ui/dialog.tsx");

  it("docks below sm and returns to a centred modal at sm and up", () => {
    // Docked: pinned to the bottom edge, square-bottomed, capped so a long form
    // scrolls inside itself rather than running off the top of the screen.
    expect(dialog).toContain("inset-x-0 bottom-0 top-auto");
    expect(dialog).toContain("rounded-t-2xl rounded-b-none");
    expect(dialog).toContain("overflow-y-auto");
    // Undone at sm+: EVERY drawer rule needs an sm: counterpart, or the desktop
    // modal inherits a bottom-docked, full-width panel.
    for (const undo of [
      "sm:inset-x-auto",
      "sm:bottom-auto",
      "sm:left-[50%]",
      "sm:top-[50%]",
      "sm:translate-x-[-50%]",
      "sm:translate-y-[-50%]",
      "sm:rounded-xl",
    ]) {
      expect(dialog).toContain(undo);
    }
  });

  it("clears the phone's home bar", () => {
    // A bottom-docked panel's last control sits exactly where the gesture bar
    // is. Without this the Done button is under it.
    expect(dialog).toContain("env(safe-area-inset-bottom)");
  });

  it("stays opt-in, so every other modal in the package is unchanged", () => {
    // This primitive backs every dialog here. A short confirm is fine centred,
    // and flipping the default is a decision about all of them, not this one.
    expect(dialog).toContain("mobileDrawer?: boolean");
    expect(dialog).toContain("mobileDrawer\n");
  });
});

describe("the close button", () => {
  it("is a muted circular plate with a real tap target", () => {
    // An unplated X at 70% opacity over the first row of a drawer is easy to
    // miss and easier to mis-tap. 36px is the target, not the glyph.
    const dialog = code("ui/dialog.tsx");
    expect(dialog).toContain("h-9 w-9 items-center justify-center rounded-full bg-zinc-100");
    expect(dialog).toContain("hover:bg-zinc-200");
  });

  it("is present on the location modal, and the modal is a drawer on mobile", () => {
    const form = code("components/EventForm.tsx");
    const at = form.indexOf("open={isLocationOpen}");
    expect(at).toBeGreaterThan(-1);
    const dialog = form.slice(at, at + 200);
    expect(dialog).toContain("mobileDrawer");
    expect(dialog).not.toContain("hideClose");
  });
});

describe("locationHasContent", () => {
  it("a physical row counts once it has an address", () => {
    expect(locationHasContent(makeLocation("PHYSICAL"))).toBe(false);
    expect(locationHasContent({ ...makeLocation("PHYSICAL"), address: "  " })).toBe(false);
    expect(locationHasContent({ ...makeLocation("PHYSICAL"), address: "Rua do Bolhao 124" })).toBe(true);
  });

  it("a physical row also counts on a map pin alone", () => {
    // A dropped pin with no typed address is a real location.
    expect(locationHasContent({ ...makeLocation("PHYSICAL"), latitude: 41.1, longitude: -8.6 })).toBe(true);
    // Half a coordinate is not.
    expect(locationHasContent({ ...makeLocation("PHYSICAL"), latitude: 41.1 })).toBe(false);
  });

  it("an online row counts once it has a url, and ignores the other kind's fields", () => {
    expect(locationHasContent(makeLocation("ONLINE"))).toBe(false);
    expect(locationHasContent({ ...makeLocation("ONLINE"), address: "Porto" })).toBe(false);
    expect(locationHasContent({ ...makeLocation("ONLINE"), url: "https://meet.google.com/x" })).toBe(true);
  });

  it("gates the primary toggle on filled rows, not on row count", () => {
    // The regression: two rows exist the moment you press Add twice, and the
    // toggle appeared then -- between two blank fields.
    const field = code("ui/event-locations-field.tsx");
    expect(field).toContain("showPrimary={filledCount > 1}");
    expect(field).toContain("rows.filter(locationHasContent).length");
    expect(field).not.toContain("showPrimary={rows.length > 1}");
  });
});
