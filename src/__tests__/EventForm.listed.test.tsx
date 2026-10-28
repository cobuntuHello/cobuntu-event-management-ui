import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventForm, type EventFormData } from "../components/EventForm";
import { renderWithConfig } from "./test-utils";

/**
 * T-288. The host chooses whether the event appears on a list at all.
 *
 * `listed` is a SEPARATE axis from viewAccess/buyAccess, not a fourth option
 * on them: those answer who may SEE and who may REGISTER, this answers
 * whether the event can be FOUND. A private hire is often open to anyone
 * holding the link, which is LESS exclusive than members-only, so it is not
 * another rung on that ladder.
 *
 * The GATE is server-side (nine list queries in core). This field only has to
 * carry the host's choice into the create/update payload — but that is
 * precisely where this package has failed before. `EventFormData` is a field
 * list in BOTH directions, and its own comments record pay-what-you-want,
 * installment plans, registration forms and member pricing each vanishing on
 * modal close because a field was not named. A toggle the host flips and the
 * wizard silently drops looks exactly like the backend gate not working, and
 * the person who would discover it is the client whose party got published.
 *
 * ⚠️ THE DEFAULT RUNS THE WRONG WAY ROUND HERE. Everywhere else in this form
 * the safe default is the closed one. Not here: `listed` defaults to TRUE,
 * matching the column, because every event that existed before this feature
 * is listed and must stay that way. So the failure mode to guard is the
 * opposite one — a `||` where a `??` belongs, which turns the host's `false`
 * back into `true` and makes the toggle look functional while doing nothing.
 */

const lastEmit = (onChange: ReturnType<typeof vi.fn>): EventFormData | null => {
  const calls = onChange.mock.calls;
  return calls.length ? (calls[calls.length - 1][0] as EventFormData) : null;
};

describe("EventForm carries the discovery choice", () => {
  it("defaults to listed, which is what every event did before this existed", async () => {
    const onChange = vi.fn();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(lastEmit(onChange)?.listed).toBe(true);
  });

  /*
   * The `|| true` bug, pinned. `false || true` is `true`, so a host who
   * unlisted an event and reopened the form would find it listed again, and
   * the next save would publish it. Only `??` survives this test.
   */
  it("seeds an UNLISTED event as unlisted, and does not quietly relist it", async () => {
    const onChange = vi.fn();
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={onChange} initialData={{ listed: false }} />,
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(lastEmit(onChange)?.listed).toBe(false);
  });

  it("emits the host's pick when they turn it off", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} />);

    await user.click(await screen.findByText(/show on the calendar/i));
    await waitFor(() => expect(lastEmit(onChange)?.listed).toBe(false));
  });

  /*
   * ⚠️ THE WORDING IS THE FEATURE, not decoration.
   *
   * Unlisted is NOT access control, and it was deliberately left uncoupled
   * from approval (28 October 2026) so a host who needs the guest list
   * enforced says so separately. A host who reads "only people with the link"
   * and stops there will believe this protects a private hire, and a
   * forwarded link will put a stranger on a client's guest list. The second
   * sentence is the only thing standing between that belief and that
   * outcome, so it is asserted rather than left to a reviewer to notice.
   */
  it("warns that a link still lets anyone register, when approval is off", async () => {
    const user = userEvent.setup();
    renderWithConfig(<EventForm communityTag="c-1" onChange={vi.fn()} />);

    await user.click(await screen.findByText(/show on the calendar/i));

    expect(
      await screen.findByText(/anyone with the link can still register/i),
    ).toBeInTheDocument();
  });

  it("drops the warning once approval is on, because it is no longer true", async () => {
    const user = userEvent.setup();
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={vi.fn()} initialData={{ requiresApproval: true }} />,
    );

    await user.click(await screen.findByText(/show on the calendar/i));

    expect(await screen.findByText(/you approve each one/i)).toBeInTheDocument();
    expect(screen.queryByText(/anyone with the link can still register/i)).toBeNull();
  });
});
