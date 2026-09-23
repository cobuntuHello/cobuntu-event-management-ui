import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventForm, type EventFormData } from "../components/EventForm";
import { renderWithConfig } from "./test-utils";

/**
 * The create form used to throw away every map pin the picker resolved.
 *
 * `EventForm` rendered `EventLocationSelector` without `onCoordinatesChange`,
 * and the selector calls that prop optionally — so picking "Casa Capitão, R.
 * da Cintura" set the ADDRESS and silently dropped the lat/lng. The event
 * saved with a location the host could read and no coordinates, and the
 * community-app detail page (which needs BOTH to draw a map) fell back to
 * "Location to be announced" on an event that plainly had a venue.
 *
 * 57 live events were created in that state. The EDIT path
 * (`LocationEditModal`) never had the bug, which is why it looked intermittent.
 *
 * These are driven through the real picker rather than asserted on source, so
 * they fail if the wiring is removed OR if the selector stops emitting.
 */

const LISBON = { lat: 38.7223, lng: -9.1393 };

const getLocationDetails = vi.fn();
const searchLocations = vi.fn();

vi.mock("../lib/google-maps", () => ({
  isGoogleMapsConfigured: () => true,
  searchLocations: (q: string) => searchLocations(q),
  getLocationDetails: (id: string) => getLocationDetails(id),
  isValidUrl: () => false,
  isVideoConferencingUrl: () => false,
}));

/** Walk the form to the location dialog, add a place, and pick a suggestion. */
async function pickSuggestion(user: ReturnType<typeof userEvent.setup>, typed = "Casa Capitao") {
  await user.click(screen.getByRole("button", { name: /add location/i }));
  // Phase 2: the repeatable field starts empty — create a physical row first.
  await user.click(await screen.findByRole("button", { name: /add place/i }));
  const input = await screen.findByPlaceholderText(/search for a place/i);
  await user.type(input, typed);
  /*
   * By ROLE, not by text: the typed value also renders in the "picked
   * address" chip below the field, so a bare text query matches twice.
   * The suggestion is the only BUTTON carrying the accented name.
   */
  const suggestion = await screen.findByRole(
    "button", { name: /Casa Capitão/ }, { timeout: 3000 },
  );
  await user.click(suggestion);
  return input;
}

/** The latest payload the form emitted, or null if it never emitted. */
function lastEmit(onChange: ReturnType<typeof vi.fn>): EventFormData | null {
  const calls = onChange.mock.calls;
  return calls.length ? (calls[calls.length - 1][0] as EventFormData) : null;
}

describe("EventForm keeps the coordinates the location picker resolves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchLocations.mockResolvedValue([
      {
        place_id: "place-1",
        description: "Casa Capitão, Lisboa",
        // The row renders main_text / secondary_text, NOT description.
        main_text: "Casa Capitão",
        secondary_text: "R. da Cintura do Porto de Lisboa",
        types: ["establishment"],
      },
    ]);
    getLocationDetails.mockResolvedValue({
      place_id: "place-1",
      formatted_address: "Casa Capitão, R. da Cintura, Lisboa",
      name: "Casa Capitão",
      geometry: { location: LISBON },
      types: ["establishment"],
    });
  });

  it("emits physicalLatitude/physicalLongitude alongside the address", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} />);

    await pickSuggestion(user);

    await waitFor(() => {
      expect(lastEmit(onChange)?.physicalLocation).toBe("Casa Capitão, R. da Cintura, Lisboa");
    });
    // The whole point: the address WITHOUT the pin is the bug.
    expect(lastEmit(onChange)?.physicalLatitude).toBe(LISBON.lat);
    expect(lastEmit(onChange)?.physicalLongitude).toBe(LISBON.lng);
  });

  it("emits null coordinates when Google has no details for the suggestion", async () => {
    // The selector falls back to the raw description here. An address with no
    // pin is legitimate; a STALE pin is not.
    getLocationDetails.mockResolvedValue(null);
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} />);

    await pickSuggestion(user);

    await waitFor(() => {
      expect(lastEmit(onChange)?.physicalLocation).toBe("Casa Capitão, Lisboa");
    });
    expect(lastEmit(onChange)?.physicalLatitude).toBeNull();
    expect(lastEmit(onChange)?.physicalLongitude).toBeNull();
  });

  it("drops the pin when the host hand-edits the address afterwards", async () => {
    /*
     * The second half of the same defect. The selector only cleared
     * coordinates when the field was emptied, so typing over a picked address
     * left the pin on the OLD venue: label and map disagreeing, with nothing
     * in the saved row to tell you which one was meant.
     */
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} />);

    const input = await pickSuggestion(user);
    await waitFor(() => expect(lastEmit(onChange)?.physicalLatitude).toBe(LISBON.lat));

    await user.type(input, " (side entrance)");

    await waitFor(() => {
      expect(lastEmit(onChange)?.physicalLocation).toMatch(/side entrance/);
    });
    expect(lastEmit(onChange)?.physicalLatitude).toBeNull();
    expect(lastEmit(onChange)?.physicalLongitude).toBeNull();
  });

  it("seeds from initialData so a re-mounted wizard step keeps its pin", async () => {
    // The wizard unmounts the form between steps and replays initialData.
    // Without seeding, going back and forward would quietly lose the pin.
    const onChange = vi.fn();
    renderWithConfig(
      <EventForm
        communityTag="c-1"
        onChange={onChange}
        initialData={{
          physicalLocation: "Casa Capitão, R. da Cintura, Lisboa",
          physicalLatitude: LISBON.lat,
          physicalLongitude: LISBON.lng,
        }}
      />,
    );

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(lastEmit(onChange)?.physicalLatitude).toBe(LISBON.lat);
    expect(lastEmit(onChange)?.physicalLongitude).toBe(LISBON.lng);
  });
});
