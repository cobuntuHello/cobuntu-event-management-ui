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

const getApiKey = () => process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export const isGoogleMapsConfigured = (): boolean => !!getApiKey();

const loadGoogleMapsAPI = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") { reject(new Error("Server-side")); return; }
    if ((window as any).google?.maps) { resolve(); return; }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${getApiKey()}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps API"));
    document.head.appendChild(script);
  });
};

const EXCLUDED_LOCATION_TYPES = ["country", "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3", "colloquial_area"];

export const searchLocations = async (query: string): Promise<LocationSuggestion[]> => {
  if (!isGoogleMapsConfigured() || !query.trim()) return [];
  try {
    await loadGoogleMapsAPI();
    const service = new (window as any).google.maps.places.AutocompleteService();
    return new Promise((resolve, reject) => {
      service.getPlacePredictions({ input: query }, (predictions: any[], status: string) => {
        if (status === "ZERO_RESULTS") { resolve([]); return; }
        if (status !== "OK") { reject(new Error(status)); return; }
        const filtered = (predictions || []).filter((p: any) => {
          const types: string[] = p.types || [];
          const hasBroad = types.some((t: string) => EXCLUDED_LOCATION_TYPES.includes(t));
          const hasSpecific = types.some((t: string) => ["locality", "sublocality", "neighborhood", "premise", "street_address", "route", "establishment", "point_of_interest", "natural_feature", "airport", "park", "tourist_attraction"].includes(t));
          if (hasSpecific) return true;
          if (hasBroad && !hasSpecific) return false;
          return true;
        });
        resolve(filtered.map((p: any) => ({
          place_id: p.place_id,
          description: p.description,
          main_text: p.structured_formatting?.main_text || p.description,
          secondary_text: p.structured_formatting?.secondary_text || "",
          types: p.types || [],
        })));
      });
    });
  } catch { return []; }
};

export const getLocationDetails = async (placeId: string): Promise<LocationDetails | null> => {
  if (!isGoogleMapsConfigured()) return null;
  try {
    await loadGoogleMapsAPI();
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
