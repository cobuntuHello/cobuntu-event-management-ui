import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventForm, ATTENDEE_VISIBILITY_OPTIONS, type EventFormData } from "../components/EventForm";
import { renderWithConfig } from "./test-utils";

/**
 * T-128. The host chooses who sees the attendee roster.
 *
 * Four modes. The GATE is server-side (transformEvent, and the v1 public API
 * separately); this field only carries the host's choice to the create/update
 * payload, so what matters here is that the choice survives the form's own
 * allowlist.
 *
 * That allowlist is the thing worth testing. `EventFormData` is a field list in
 * BOTH directions, and this package has lost settings to it repeatedly — the
 * type's own comments record pay-what-you-want, installment plans, registration
 * forms and member pricing all vanishing on modal close because a field was not
 * named. A setting the host picks and the wizard silently drops would look
 * identical to the gate not working.
 */

const lastEmit = (onChange: ReturnType<typeof vi.fn>): EventFormData | null => {
  const calls = onChange.mock.calls;
  return calls.length ? (calls[calls.length - 1][0] as EventFormData) : null;
};

describe("EventForm carries the attendee-visibility choice", () => {
  it("defaults to PUBLIC, which is what every event did before this existed", async () => {
    const onChange = vi.fn();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(lastEmit(onChange)?.attendeeVisibility).toBe("PUBLIC");
  });

  it("seeds from initialData, so a re-mounted wizard step keeps the choice", async () => {
    // The wizard unmounts the form between steps and replays initialData.
    // Without seeding, stepping back and forward silently resets it to PUBLIC —
    // the most open option, which is the worst direction to fail in.
    const onChange = vi.fn();
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={onChange} initialData={{ attendeeVisibility: "HIDDEN" }} />,
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(lastEmit(onChange)?.attendeeVisibility).toBe("HIDDEN");
  });

  it("emits the host's pick", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /who can see the guest list/i }));
    await user.click(await screen.findByRole("radio", { name: /just the number/i }));

    await waitFor(() => {
      expect(lastEmit(onChange)?.attendeeVisibility).toBe("COUNT_ONLY");
    });
  });

  it("shows every option with its explanation, and ticks the current one", async () => {
    /*
     * The reason this is a sheet and not a dropdown: a <select> can only show
     * the sentence for the option already chosen, so the consequence of the
     * other three is invisible at the moment you are choosing between them.
     */
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /who can see the guest list/i }));

    const radios = await screen.findAllByRole("radio");
    expect(radios).toHaveLength(ATTENDEE_VISIBILITY_OPTIONS.length);
    for (const o of ATTENDEE_VISIBILITY_OPTIONS) {
      expect(screen.getByText(o.hint)).toBeInTheDocument();
    }
    // Exactly one tick, on the default — asserted on BOTH the aria state and
    // the VISIBLE mark. Checking only aria-checked let a sabotage that drew a
    // tick on every row pass: the rows would read as four independent toggles
    // to anyone looking at the screen, while the accessibility tree stayed
    // correct.
    expect(radios.filter(r => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /everyone/i })).toHaveAttribute("aria-checked", "true");
    expect(document.querySelectorAll(".lucide-check")).toHaveLength(1);
  });

  it("closes the sheet on pick, since one choice IS the decision", async () => {
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /who can see the guest list/i }));
    await user.click(await screen.findByRole("radio", { name: /nobody/i }));
    await waitFor(() => expect(screen.queryByRole("radio")).not.toBeInTheDocument());
  });

  it("offers exactly the four backend modes", () => {
    // A label the backend enum does not accept is a 400 at create time, and a
    // missing one is a mode no host can reach.
    expect(ATTENDEE_VISIBILITY_OPTIONS.map(o => o.value)).toEqual([
      "PUBLIC", "ATTENDEES_ONLY", "COUNT_ONLY", "HIDDEN",
    ]);
  });

  it("explains every option, since the labels alone are ambiguous", () => {
    // "Attendees only" and "Nobody" mean nothing without the sentence under
    // them, and the row shows the hint for whatever is selected.
    for (const o of ATTENDEE_VISIBILITY_OPTIONS) {
      expect(o.hint.length, o.value).toBeGreaterThan(20);
    }
  });
});
