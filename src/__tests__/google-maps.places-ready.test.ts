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

beforeEach(() => {
  delete (window as any).google;
  mapsScripts().forEach((s) => s.remove());
});
afterEach(() => {
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
