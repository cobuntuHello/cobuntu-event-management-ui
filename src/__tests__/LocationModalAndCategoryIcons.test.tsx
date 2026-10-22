import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isValidOnlineUrl,
  locationRowError,
  locationErrors,
  makeLocation,
  type EventLocationValue,
} from "../ui/event-locations-field";
import { CategoryIcon } from "../components/CategoryPickerRow";

/**
 * Three reports on the Event Location / Category modals (T-270).
 *
 * The validators are real logic and are tested as such. The two layout facts
 * are read from source: a jsdom render has no viewport and applies no
 * stylesheet, so it cannot tell you whether a parent clips a child -- a render
 * test would assert the classnames anyway, with more machinery and the same
 * evidence. Same reasoning the existing chrome test in this folder states.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, "..", p), "utf8");

const online = (url: string): EventLocationValue => ({ ...makeLocation("ONLINE", true), url });
const physical = (address: string): EventLocationValue => ({ ...makeLocation("PHYSICAL", true), address });

describe("1 · the address suggestions are not clipped", () => {
  /*
   * The modal is <DialogContent ... scrollBody>, which makes the dialog body an
   * overflow-y-auto container. A scroll container CLIPS its descendants no
   * matter their z-index -- clipping is not a stacking question -- so the list
   * was cut off at the body's edge and the z-50 it carried did nothing.
   */
  it("renders the list in flow, not absolutely positioned", () => {
    for (const f of ["ui/event-locations-field.tsx", "ui/event-location-selector.tsx"]) {
      const src = read(f);
      expect(src, `${f}: list must not be absolute`).not.toContain("absolute z-50 w-full mt-1");
      expect(src, `${f}: list still rendered`).toMatch(/mt-1 w-full bg-white border border-zinc-200 rounded-lg/);
    }
  });

  /*
   * In flow the list can open below the fold of the scrolling body -- it is
   * not floating over anything, so it only exists where there is room.
   */
  it("brings the list into view when it opens", () => {
    expect(read("ui/event-locations-field.tsx")).toContain("scrollIntoView");
  });
});

describe("2 · an empty or malformed location cannot be saved", () => {
  /*
   * The payload builder FILTERS contentless rows out, so before this an online
   * row left blank vanished on save with nothing said. Refusing beats
   * discarding what someone deliberately added.
   */
  it("rejects an empty online row instead of dropping it", () => {
    expect(locationRowError(online(""))).toMatch(/Add a link/);
    expect(locationRowError(online("   "))).toMatch(/Add a link/);
  });

  it("rejects an empty physical row", () => {
    expect(locationRowError(physical(""))).toMatch(/Add an address/);
  });

  /* Non-empty is not enough: these all look like someone tried, and all
     produce a dead link on the event page. */
  it("rejects things that are not links", () => {
    for (const bad of ["zoom", "meet.google.com/abc", "www.zoom.us/j/1", "mailto:a@b.com", "javascript:alert(1)", "https://localhost"]) {
      expect(isValidOnlineUrl(bad), bad).toBe(false);
    }
  });

  it("accepts the links communities actually use", () => {
    for (const ok of [
      "https://zoom.us/j/123456",
      "https://meet.google.com/abc-defg-hij",
      "https://teams.microsoft.com/l/meetup-join/x",
      "https://whereby.com/cobuntu",
      "http://my-own-webinar.example.com/live",
    ]) {
      expect(isValidOnlineUrl(ok), ok).toBe(true);
    }
  });

  /*
   * Deliberately NOT an allowlist of providers. Communities use Zoom, Meet,
   * Teams, Whereby, Jitsi and their own tooling, so "unrecognised provider"
   * would be wrong far more often than right.
   */
  it("does not restrict which provider a link points at", () => {
    expect(isValidOnlineUrl("https://some-tool-nobody-has-heard-of.io/room/7")).toBe(true);
  });

  it("keys errors by row so the message can sit on the offending row", () => {
    const rows = [physical("Cascais, Portugal"), online(""), online("https://zoom.us/j/1")];
    const errs = locationErrors(rows);
    expect(Object.keys(errs)).toEqual([rows[1].key]);
    expect(locationErrors([physical("Lisbon"), online("https://meet.google.com/x")])).toEqual({});
  });

  /* Both modals gate on it, and both only reveal errors after the press -- a
     row marked red the moment it is added scolds someone mid-typing. */
  it("is wired into Done and into Save", () => {
    const form = read("components/EventForm.tsx");
    expect(form).toContain("locationErrors");
    expect(form).toMatch(/setLocationSubmitted\(true\);\s*\n\s*if \(Object\.keys\(locationErrors\(locations\)\)\.length > 0\) return;/);
    expect(form).toContain("errors={locationSubmitted ? locationRowErrors : undefined}");

    const edit = read("components/LocationEditModal.tsx");
    expect(edit).toMatch(/setSubmitted\(true\);\s*\n\s*if \(Object\.keys\(locationErrors\(locations\)\)\.length > 0\) return;/);
  });

  /* Close is the way out and must stay free: it discards nothing the field has
     not already written. */
  it("leaves Close unguarded", () => {
    const form = read("components/EventForm.tsx");
    expect(form).toMatch(/variant="secondary" onClick=\{\(\) => \{ setLocationSubmitted\(false\); setIsLocationOpen\(false\); \}\}/);
  });
});

describe("3 · categories show their own icon", () => {
  it("renders the photo when the category has one", () => {
    const { container } = render(<CategoryIcon iconId="mdi:calendar" iconColor="#ff0000" imageUrl="https://img/x.png" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://img/x.png");
  });

  it("renders the Iconify glyph on the category's colour", () => {
    const { container } = render(<CategoryIcon iconId="mdi:calendar" iconColor="#ff0000" imageUrl={null} />);
    const disc = container.querySelector("span")!;
    expect(disc.getAttribute("style")).toContain("#ff0000");
    /* Rendered through @iconify/react, like the admin's Manage Categories tile
       and product-management-ui's CategoryEditModal. Iconify resolves the glyph
       asynchronously, so the element is what is pinned here, not its paths. */
    expect(disc.querySelector("span, svg")).not.toBeNull();
  });

  /* One renderer across the sibling packages. A second way of drawing the same
     icons is a difference somebody has to discover later. */
  it("uses the same icon library the sibling packages use", () => {
    expect(read("components/CategoryPickerRow.tsx")).toContain('from "@iconify/react"');
  });

  /*
   * No fallback glyph. Most categories have an icon (57/60 product, 100/103
   * course, 48/57 event), so a stand-in would be the exception in costume --
   * and blog categories have none at all, where a default would land on every
   * chip.
   */
  it("renders nothing when the category has no icon", () => {
    const { container } = render(<CategoryIcon iconId={null} iconColor={null} imageUrl={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("is decorative, so it is not announced beside the name", () => {
    render(<CategoryIcon iconId="mdi:calendar" iconColor={null} imageUrl={null} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  /* Both chip rows and the collapsed summary render it; the tick survives only
     for a category with no icon of its own. */
  it("is used by the chips and by the collapsed row", () => {
    const src = read("components/CategoryPickerRow.tsx");
    expect((src.match(/<CategoryIcon/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(src).toContain("summary && selected && (selected.iconId || selected.imageUrl)");
  });
});
