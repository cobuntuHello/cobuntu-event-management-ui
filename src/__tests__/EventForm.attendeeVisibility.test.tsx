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

    await user.click(screen.getByRole("combobox", { name: /who can see the guest list/i }));
    await user.click(await screen.findByRole("option", { name: /just the number/i }));

    await waitFor(() => {
      expect(lastEmit(onChange)?.attendeeVisibility).toBe("COUNT_ONLY");
    });
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
