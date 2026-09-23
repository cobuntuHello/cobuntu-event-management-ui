import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventForm, type EventFormData } from "../components/EventForm";
import { renderWithConfig } from "./test-utils";

/**
 * Phase 2: an event can carry several locations. The form emits `locations[]`
 * (source of truth) while the flat fields keep mirroring the primary for
 * back-compat.
 */

vi.mock("../lib/google-maps", () => ({
  isGoogleMapsConfigured: () => true,
  searchLocations: async () => [],
  getLocationDetails: async () => null,
  isValidUrl: () => true,
  isVideoConferencingUrl: () => false,
}));

const lastEmit = (onChange: ReturnType<typeof vi.fn>): EventFormData | null => {
  const calls = onChange.mock.calls;
  return calls.length ? (calls[calls.length - 1][0] as EventFormData) : null;
};

describe("EventForm — multiple locations", () => {
  it("emits every location, one primary, and mirrors the primary to the flat fields", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /add location/i }));
    // Two physical + one online.
    await user.click(await screen.findByRole("button", { name: /add place/i }));
    await user.click(screen.getByRole("button", { name: /add place/i }));
    await user.click(screen.getByRole("button", { name: /add online link/i }));

    const addressInputs = screen.getAllByPlaceholderText(/search for a place/i);
    await user.type(addressInputs[0], "Venue A");
    await user.type(addressInputs[1], "Venue B");
    await user.type(screen.getByPlaceholderText(/zoom.us/i), "https://zoom.us/j/1");

    await waitFor(() => {
      const locs = lastEmit(onChange)?.locations || [];
      expect(locs).toHaveLength(3);
    });

    const locs = lastEmit(onChange)!.locations!;
    expect(locs.filter((l) => l.isPrimary)).toHaveLength(1);
    // First physical is primary by default, and mirrors to the flat field.
    expect(locs.find((l) => l.isPrimary)).toMatchObject({ kind: "PHYSICAL", address: "Venue A" });
    await waitFor(() => expect(lastEmit(onChange)?.physicalLocation).toBe("Venue A"));
    await waitFor(() => expect(lastEmit(onChange)?.onlineUrl).toBe("https://zoom.us/j/1"));
  });

  it("seeds from initialData.locations", async () => {
    const onChange = vi.fn();
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={onChange} initialData={{
        locations: [
          { kind: "PHYSICAL", address: "Main Hall", isPrimary: true },
          { kind: "ONLINE", url: "https://meet.example.com/x" },
        ],
      } as any} />,
    );
    await waitFor(() => expect((lastEmit(onChange)?.locations || []).length).toBe(2));
    expect(lastEmit(onChange)?.physicalLocation).toBe("Main Hall");
  });
});
