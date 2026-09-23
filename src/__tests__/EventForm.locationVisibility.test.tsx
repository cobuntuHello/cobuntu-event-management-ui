import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventForm, LOCATION_VISIBILITY_OPTIONS, type EventFormData } from "../components/EventForm";
import { renderWithConfig } from "./test-utils";

/**
 * The host chooses who sees the PHYSICAL location.
 *
 * Two modes. The GATE is server-side (transformEvent + the v1 public API);
 * this field only carries the host's choice to the create/update payload, so
 * what matters here is that the choice survives the form's own allowlist —
 * the same allowlist that has quietly dropped settings before (see the
 * attendee-visibility test for the history). The online meeting link is a
 * separate, always-attendee-only rule and is deliberately NOT a choice here.
 */

const lastEmit = (onChange: ReturnType<typeof vi.fn>): EventFormData | null => {
  const calls = onChange.mock.calls;
  return calls.length ? (calls[calls.length - 1][0] as EventFormData) : null;
};

describe("EventForm carries the location-visibility choice", () => {
  it("defaults to PUBLIC, so the address stays public as it did before", async () => {
    const onChange = vi.fn();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(lastEmit(onChange)?.locationVisibility).toBe("PUBLIC");
  });

  it("seeds from initialData, so a re-mounted wizard step keeps the choice", async () => {
    const onChange = vi.fn();
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={onChange} initialData={{ locationVisibility: "ATTENDEES_ONLY" }} />,
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(lastEmit(onChange)?.locationVisibility).toBe("ATTENDEES_ONLY");
  });

  it("emits the host's pick", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /who can see the location/i }));
    await user.click(await screen.findByRole("radio", { name: /attendees only/i }));

    await waitFor(() => {
      expect(lastEmit(onChange)?.locationVisibility).toBe("ATTENDEES_ONLY");
    });
  });

  it("shows both options with their explanation, and ticks exactly one", async () => {
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /who can see the location/i }));

    const radios = await screen.findAllByRole("radio");
    expect(radios).toHaveLength(LOCATION_VISIBILITY_OPTIONS.length);
    for (const o of LOCATION_VISIBILITY_OPTIONS) {
      expect(screen.getByText(o.hint)).toBeInTheDocument();
    }
    expect(radios.filter(r => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /everyone/i })).toHaveAttribute("aria-checked", "true");
    // Exactly one visible tick inside this dialog.
    expect(document.querySelectorAll(".lucide-check")).toHaveLength(1);
  });

  it("closes the sheet on pick, since one choice IS the decision", async () => {
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /who can see the location/i }));
    await user.click(await screen.findByRole("radio", { name: /attendees only/i }));
    await waitFor(() => expect(screen.queryByRole("radio")).not.toBeInTheDocument());
  });

  it("offers exactly the two backend modes", () => {
    // A label the backend enum does not accept is a 400 at create time.
    expect(LOCATION_VISIBILITY_OPTIONS.map(o => o.value)).toEqual(["PUBLIC", "ATTENDEES_ONLY"]);
  });

  it("explains every option, since the labels alone are ambiguous", () => {
    for (const o of LOCATION_VISIBILITY_OPTIONS) {
      expect(o.hint.length, o.value).toBeGreaterThan(20);
    }
  });
});
