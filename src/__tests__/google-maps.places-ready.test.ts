/**
 * Place search waits for Google's Places library to be READY (2026-11-10).
 *
 * A host on Pathseekers typed a venue and got "Place search is unavailable
 * right now", while Google recorded no failed request at all. Two ways the
 * search ran with no Places library:
 *   - the map preview loads the Maps script WITHOUT `places`, so on a page that
 *     showed a map first `google.maps` existed and the loader returned at once;
 *   - with `loading=async`, `onload` fires before the libraries arrive.
 * And every keystroke typed while the script loaded appended another copy.
 *
 * Pinned: searchLocations asks importLibrary("places") and uses what it
 * returns; concurrent searches share ONE script; a failed load is retried.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const suggestion = (text: string) => ({
  placePrediction: { placeId: `id-${text}`, text: { text }, mainText: { text }, secondaryText: { text: "Cascais" }, types: ["restaurant"] },
});

function placesLib() {
  return {
    AutocompleteSuggestion: {
      fetchAutocompleteSuggestions: vi.fn(async () => ({ suggestions: [suggestion("Honest Greens Cascais")] })),
    },
    AutocompleteService: vi.fn(),
  };
}

async function freshModule() {
  vi.resetModules();
  const mod = await import("../lib/google-maps");
  mod.setGoogleMapsApiKey("test-key");
  return mod;
}

const mapsScripts = () => document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]');

/*
 * happy-dom FETCHES a <script src> for real when it is appended. In CI that
 * request to maps.googleapis.com fails and fires `error` before a test can play
 * the load itself, so every "the script arrives" case failed for a reason that
 * has nothing to do with the loader (first seen when these tests first ran in
 * CI, 2026-11-12). A non-JavaScript `type` keeps the element, and the src the
 * assertions select on, without the fetch; each test fires onload / onerror
 * itself, as it always meant to.
 */
let appendSpy: { mockRestore: () => void } | null = null;
beforeEach(() => {
  delete (window as any).google;
  mapsScripts().forEach((s) => s.remove());
  const realAppend = document.head.appendChild.bind(document.head);
  appendSpy = vi.spyOn(document.head, "appendChild").mockImplementation(((node: Node) => {
    if (node instanceof HTMLScriptElement && node.src.includes("maps.googleapis.com")) {
      node.type = "text/x-not-fetched-in-tests";
    }
    return realAppend(node);
  }) as any);
});
afterEach(() => {
  appendSpy?.mockRestore();
  appendSpy = null;
  delete (window as any).google;
  mapsScripts().forEach((s) => s.remove());
});

describe("searchLocations waits for the Places library", () => {
  it("loads Places on demand when the script is there WITHOUT it (the map preview's script)", async () => {
    const lib = placesLib();
    // google.maps exists, google.maps.places does not: exactly the map-preview page.
    (window as any).google = { maps: { importLibrary: vi.fn(async (name: string) => (name === "places" ? lib : null)) } };
    const { searchLocations } = await freshModule();

    const results = await searchLocations("Honest Greens");

    expect((window as any).google.maps.importLibrary).toHaveBeenCalledWith("places");
    expect(results.map((r) => r.description)).toEqual(["Honest Greens Cascais"]);
    expect(mapsScripts().length).toBe(0); // reused, not re-loaded
  });

  it("searches typed while the script loads share ONE script", async () => {
    const { searchLocations } = await freshModule();
    const a = searchLocations("Hon");
    const b = searchLocations("Honest");
    await Promise.resolve();
    expect(mapsScripts().length).toBe(1);

    // The script arrives; Places becomes available through importLibrary.
    const lib = placesLib();
    (window as any).google = { maps: { importLibrary: vi.fn(async () => lib) } };
    (mapsScripts()[0] as HTMLScriptElement).onload?.(new Event("load"));

    await expect(a).resolves.toHaveLength(1);
    await expect(b).resolves.toHaveLength(1);
    expect(mapsScripts().length).toBe(1);
  });

  it("a failed load is retried on the next search, not remembered", async () => {
    const { searchLocations } = await freshModule();
    const first = searchLocations("Honest");
    await Promise.resolve();
    (mapsScripts()[0] as HTMLScriptElement).onerror?.(new Event("error"));
    await expect(first).rejects.toThrow(/Failed to load Google Maps API/);

    mapsScripts().forEach((s) => s.remove());
    const second = searchLocations("Honest Greens");
    await Promise.resolve();
    expect(mapsScripts().length).toBe(1); // a fresh attempt
    const lib = placesLib();
    (window as any).google = { maps: { importLibrary: vi.fn(async () => lib) } };
    (mapsScripts()[0] as HTMLScriptElement).onload?.(new Event("load"));
    await expect(second).resolves.toHaveLength(1);
  });

  it("still says unavailable when Places truly cannot be had", async () => {
    (window as any).google = { maps: { importLibrary: vi.fn(async () => { throw new Error("blocked"); }) } };
    const { searchLocations } = await freshModule();
    await expect(searchLocations("Honest")).rejects.toThrow(/PLACES_UNAVAILABLE/);
  }, 10_000);
});
