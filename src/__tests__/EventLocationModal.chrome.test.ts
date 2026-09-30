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
import { addLocation, locationHasContent, makeLocation } from "../ui/event-locations-field";

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

describe("the modal has a ceiling, and the way out never scrolls away", () => {
  const dialog = code("ui/dialog.tsx");
  const form = code("components/EventForm.tsx");

  it("stops the PANEL scrolling, so exactly one container does", () => {
    // The bug: the panel itself was the scroll container, so Cancel and Done
    // travelled with the rows. Add eight locations and the way out of the
    // dialog was something you had to go looking for.
    expect(dialog).toContain('scrollBody ? "flex flex-col overflow-hidden" : "grid gap-4"');
    // The drawer branch must stop claiming overflow when the body owns it,
    // or the panel and the body both scroll and the footer still moves.
    expect(dialog).toContain('scrollBody ? "" : "overflow-y-auto"');
  });

  it("caps the height on BOTH layouts", () => {
    // A centred modal grows unbounded too; capping only the drawer fixes the
    // phone and leaves the desktop case exactly as reported.
    expect(dialog).toContain("max-h-[88svh]");   // docked
    expect(dialog).toContain("sm:max-h-[85vh]"); // docked, at sm+
    expect(dialog).toContain('scrollBody ? "max-h-[85vh]" : ""'); // plain centred
  });

  it("pins the header and footer and gives the body the scroll", () => {
    expect(dialog).toContain("flex flex-none flex-col space-y-1.5"); // header
    expect(dialog).toContain("min-h-0 flex-1 overflow-y-auto");      // body
    // min-h-0 is load-bearing: a flex child defaults to min-height:auto and
    // refuses to shrink below its content, so the body would push the footer
    // out of the panel instead of scrolling.
    expect(dialog).toContain("flex flex-none flex-col-reverse");     // footer
    // NO top rule on the footer: the rows are already bordered cards, so a
    // hairline a few pixels under the last card read as a second, weaker
    // border rather than as chrome. The gap does the separating.
    expect(dialog).not.toContain("border-t border-zinc-100");
  });

  it("wires the location modal up to all of it", () => {
    const at = form.indexOf("open={isLocationOpen}");
    const modal = form.slice(at, at + 1400);
    expect(modal).toContain("scrollBody");
    expect(modal).toContain("<DialogBody>");
    // The list must be INSIDE the body, and the add buttons OUTSIDE it.
    expect(modal.indexOf("<DialogBody>")).toBeLessThan(modal.indexOf("<EventLocationsField"));
    expect(modal.indexOf("<LocationAddButtons")).toBeLessThan(modal.indexOf("<DialogBody>"));
    expect(modal).toContain("hideAddButtons");
  });
});

describe("addLocation", () => {
  it("appends, and the first row added is the primary", () => {
    const one = addLocation([], "PHYSICAL");
    expect(one).toHaveLength(1);
    expect(one[0].isPrimary).toBe(true);
    expect(one[0].kind).toBe("PHYSICAL");
  });

  it("does not steal primary from an existing row", () => {
    const two = addLocation(addLocation([], "PHYSICAL"), "ONLINE");
    expect(two.map((r) => r.isPrimary)).toEqual([true, false]);
  });

  it("keeps exactly one primary however many rows there are", () => {
    let rows = [] as ReturnType<typeof makeLocation>[];
    for (let i = 0; i < 6; i++) rows = addLocation(rows, i % 2 ? "ONLINE" : "PHYSICAL");
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.isPrimary)).toHaveLength(1);
  });

  it("is pure — the caller's array is untouched", () => {
    // The modal's header calls this from a setState updater; mutating the
    // previous array there is how you get a list that updates on every other
    // click.
    const before = addLocation([], "PHYSICAL");
    const snapshot = [...before];
    addLocation(before, "ONLINE");
    expect(before).toEqual(snapshot);
  });
});

describe("a location row is one frame, not two", () => {
  const field = code("ui/event-locations-field.tsx");

  it("puts the border on the CARD and takes it off the input", () => {
    // It was a bordered card wrapping a bordered input: a box inside a box,
    // both the same grey, for a single text field. Nothing had a hierarchy, so
    // the list read as a wireframe of itself.
    expect(field).toContain("rounded-xl border bg-white");
    // Both inputs go bare — leaving one of them framed is the half-fix that
    // makes the two kinds of row look like different components.
    const bare = field.split("border-0 bg-transparent px-0").length - 1;
    expect(bare).toBe(2);
  });

  it("gives the whole row a focus state", () => {
    // With two identical frames per row and eight rows, which field you were
    // typing in was genuinely hard to see. The card answers it now.
    expect(field).toContain("focus-within:border-zinc-400");
  });

  it("gives the kind a plate instead of a bare glyph", () => {
    // At 14px with no fill, the two icons were the only thing separating an
    // address row from a link row, and they read as decoration.
    expect(field).toContain("h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100");
  });

  it("weights the primary row above the rest", () => {
    // It is the one the cards and the emails feature.
    expect(field).toContain('row.isPrimary && showPrimary ? "border-zinc-300" : "border-zinc-200"');
  });
});
