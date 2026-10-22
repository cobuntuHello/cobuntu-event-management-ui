// Google Maps JavaScript API utility for location autocomplete + details.
//
// Reads `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` from the consuming app's env.
// Both cobuntu-admin and cobuntu-community-app must set this in their
// Vercel project envs to enable autocomplete. When the key is missing,
// `isGoogleMapsConfigured()` returns false and the LocationSelector
// degrades gracefully to a plain text input.

export interface LocationSuggestion {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
  types: string[];
}

export interface LocationDetails {
  place_id: string;
  formatted_address: string;
  name: string;
  geometry: { location: { lat: number; lng: number } };
  types: string[];
}

/*
 * The key, from the host when it passed one, else the Next build's env.
 *
 * The env read is literal (`process.env.NEXT_PUBLIC_...`) so Next still inlines
 * it, and wrapped because outside a Next build `process` may not exist at all.
 */
let keyOverride: string | null = null;
export function setGoogleMapsApiKey(key: string | null | undefined) {
  keyOverride = key || null;
}
export function getGoogleMapsApiKey(): string {
  if (keyOverride) return keyOverride;
  try {
    return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  } catch {
    return "";
  }
}
const getApiKey = getGoogleMapsApiKey;

export const isGoogleMapsConfigured = (): boolean => !!getApiKey();

const loadGoogleMapsAPI = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") { reject(new Error("Server-side")); return; }
    if ((window as any).google?.maps) { resolve(); return; }
    const script = document.createElement("script");
    /*
     * `loading=async` is what Google asks for and what silences the
     * "loaded directly without loading=async" warning every consumer sees in
     * their console. `v=weekly` is load-bearing rather than cosmetic: the new
     * Places classes (`AutocompleteSuggestion`, `Place`) and
     * `importLibrary` only exist on recent versions, and `searchLocations`
     * now prefers them.
     */
    script.src = `https://maps.googleapis.com/maps/api/js?key=${getApiKey()}&libraries=places&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps API"));
    document.head.appendChild(script);
  });
};

const EXCLUDED_LOCATION_TYPES = ["country", "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3", "colloquial_area"];

/**
 * A Places call that failed, as opposed to a search that found nothing.
 *
 * These two were indistinguishable for as long as this file existed:
 * `searchLocations` ended in `catch { return []; }`, so a REQUEST_DENIED and
 * "no such place" both arrived at the UI as an empty list, and NOTHING was
 * printed. A live event wizard sat there typing a city with no dropdown and a
 * completely clean console, which sent the investigation to the one place the
 * bug was not (the dropdown's own CSS).
 *
 * The status is carried so the field can say what went wrong, and so the next
 * person gets told rather than having to guess.
 */
export class PlacesError extends Error {
  constructor(public readonly status: string) {
    super(`Google Places request failed: ${status}`);
    this.name = "PlacesError";
  }
}

/**
 * Drop the predictions that are too broad to be an event venue.
 *
 * "Portugal" and "Lisbon District" are correct answers to the text typed and
 * useless as the place an event happens, so a prediction whose only types are
 * broad is dropped. One that ALSO carries a specific type is kept, because a
 * city is both, and a city is a perfectly good answer.
 *
 * Shared by both API paths deliberately: the whole point of the new-API
 * migration is that the two return the SAME list, and a filter copied into
 * each is the obvious way for that to stop being true.
 */
const SPECIFIC_LOCATION_TYPES = [
  "locality", "sublocality", "neighborhood", "premise", "street_address", "route",
  "establishment", "point_of_interest", "natural_feature", "airport", "park", "tourist_attraction",
];

function filterSuggestions(list: LocationSuggestion[]): LocationSuggestion[] {
  return list.filter((s) => {
    const types = s.types || [];
    const hasSpecific = types.some((t) => SPECIFIC_LOCATION_TYPES.includes(t));
    if (hasSpecific) return true;
    return !types.some((t) => EXCLUDED_LOCATION_TYPES.includes(t));
  });
}

/** Map a new-API suggestion onto the shape the UI already renders. */
function fromPlacePrediction(p: any): LocationSuggestion {
  return {
    place_id: p.placeId,
    description: p.text?.text ?? "",
    main_text: p.mainText?.text ?? p.text?.text ?? "",
    secondary_text: p.secondaryText?.text ?? "",
    types: p.types ?? [],
  };
}

/**
 * Autocomplete, via the NEW Places API with the legacy service as a fallback.
 *
 * ── Why both ───────────────────────────────────────────────────────────────
 *
 * The legacy `AutocompleteService` is not available to Google Cloud projects
 * that enabled Places after March 2025: the Maps JavaScript API loads
 * perfectly, the key is valid, and then every autocomplete call comes back
 * REQUEST_DENIED. That is exactly the shape of the failure reported against
 * the admin app, and it is invisible for the reason described on PlacesError
 * above.
 *
 * The new API is tried first because it is where Google is putting new
 * projects. The legacy path stays because projects enabled BEFORE that cutoff
 * still work on it, and dropping it would break the apps that are fine today
 * in order to fix the ones that are not.
 *
 * A failure on BOTH paths throws, rather than returning an empty list. The
 * caller decides what to show; what it must not do is pretend the place does
 * not exist.
 */
export const searchLocations = async (query: string): Promise<LocationSuggestion[]> => {
  if (!isGoogleMapsConfigured() || !query.trim()) return [];
  await loadGoogleMapsAPI();

  const places = (window as any).google?.maps?.places;

  // ── Preferred: Places API (New) ──
  if (places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    try {
      const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query });
      return filterSuggestions(
        (suggestions ?? [])
          .map((s: any) => s.placePrediction)
          .filter(Boolean)
          .map(fromPlacePrediction),
      );
    } catch {
      // Fall through to the legacy service: a project on the old API answers
      // there, and this throw tells us nothing about which case we are in.
    }
  }

  // ── Fallback: the legacy AutocompleteService ──
  if (!places?.AutocompleteService) throw new PlacesError("PLACES_UNAVAILABLE");
  try {
    const service = new places.AutocompleteService();
    return await new Promise<LocationSuggestion[]>((resolve, reject) => {
      service.getPlacePredictions({ input: query }, (predictions: any[], status: string) => {
        if (status === "ZERO_RESULTS") { resolve([]); return; }
        if (status !== "OK") { reject(new PlacesError(status)); return; }
        resolve(filterSuggestions((predictions || []).map((p: any) => ({
          place_id: p.place_id,
          description: p.description,
          main_text: p.structured_formatting?.main_text || p.description,
          secondary_text: p.structured_formatting?.secondary_text || "",
          types: p.types || [],
        }))));
      });
    });
  } catch (e) {
    /*
     * Rethrown, NOT swallowed. This `catch { return []; }` is the line that
     * made the admin's broken autocomplete look like a city that does not
     * exist. A thrown PlacesError reaches the field, which says so.
     */
    throw e instanceof PlacesError ? e : new PlacesError("UNKNOWN");
  }
};

export const getLocationDetails = async (placeId: string): Promise<LocationDetails | null> => {
  if (!isGoogleMapsConfigured()) return null;
  await loadGoogleMapsAPI();

  /*
   * The new Places API first, for the same reason autocomplete prefers it: a
   * project enabled after March 2025 has no legacy PlacesService either, so
   * fixing only the suggestion list would have produced a dropdown you could
   * open and a pin you could never get. Returning null here is honest -- the
   * caller falls back to the typed address with no coordinates, which is the
   * documented degraded mode.
   */
  const Place = (window as any).google?.maps?.places?.Place;
  if (Place) {
    try {
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: ["id", "formattedAddress", "displayName", "location", "types"] });
      return {
        place_id: place.id || "",
        formatted_address: place.formattedAddress || "",
        name: place.displayName || "",
        geometry: { location: { lat: place.location?.lat() ?? 0, lng: place.location?.lng() ?? 0 } },
        types: place.types || [],
      };
    } catch {
      // Fall through to the legacy service, which answers on older projects.
    }
  }

  try {
    const div = document.createElement("div");
    div.style.display = "none";
    document.body.appendChild(div);
    const service = new (window as any).google.maps.places.PlacesService(div);
    return new Promise((resolve, reject) => {
      service.getDetails({ placeId, fields: ["place_id", "formatted_address", "name", "geometry", "types"] }, (place: any, status: string) => {
        document.body.removeChild(div);
        if (status !== "OK" || !place) { reject(new Error(status)); return; }
        resolve({
          place_id: place.place_id || "",
          formatted_address: place.formatted_address || "",
          name: place.name || "",
          geometry: { location: { lat: place.geometry?.location?.lat() || 0, lng: place.geometry?.location?.lng() || 0 } },
          types: place.types || [],
        });
      });
    });
  } catch { return null; }
};

export const isValidUrl = (str: string): boolean => {
  try { const u = new URL(str); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; }
};

export const isVideoConferencingUrl = (url: string): boolean => {
  if (!isValidUrl(url)) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ["zoom.us", "meet.google.com", "teams.microsoft.com", "webex.com", "meet.jit.si", "discord.gg"].some(p => hostname.includes(p));
  } catch { return false; }
};
