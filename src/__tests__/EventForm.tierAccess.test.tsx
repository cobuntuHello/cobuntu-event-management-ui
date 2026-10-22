import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { EventForm } from "../components/EventForm";

/**
 * The access card as a host meets it.
 *
 * The binary Visibility/Attendance switches became two questions, each with a
 * membership-tier list under it. What matters here is the WIRING: that the
 * picker's three modes reach the submit payload as the pair the backend
 * expects (an enum plus a tier list), and that an existing event opens in the
 * state it was saved in.
 */

const TIERS = [
  { id: "t1", name: "Founding" },
  { id: "t2", name: "Alumni" },
];

function render(props: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  renderWithConfig(
    <EventForm communityTag="acme" onChange={onChange} categories={[]} membershipTiers={TIERS} {...props} />,
  );
  return () => onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
}

describe("what reaches the payload", () => {
  it("defaults to public on both axes, with no tier rows", () => {
    const latest = render();
    const d = latest();
    expect(d.viewability).toBe("PUBLIC");
    expect(d.accessibility).toBe("PUBLIC");
    expect(d.viewTierIds).toEqual([]);
    expect(d.buyTierIds).toEqual([]);
  });

  it("sends MEMBERS_ONLY with NO rows for All members", () => {
    /*
     * The pair that means "every tier". Sending rows here would be wrong in a
     * way nothing would catch: it would still work today and then silently
     * exclude any tier created afterwards.
     *
     * Public/All members/Specific tiers are now a radio group (a direct
     * mode choice), not checkboxes you toggle off a prior selection — so
     * selecting "All members" is a single direct click on the VIEW axis's
     * own row (the first of the two "All members" radios on the page).
     */
    const latest = render();
    fireEvent.click(screen.getAllByRole("radio", { name: /All members/ })[0]);
    const d = latest();
    expect(d.viewability).toBe("MEMBERS_ONLY");
    expect(d.viewTierIds).toEqual([]);
  });

  it("drags registration in when visibility narrows under it", () => {
    /*
     * This test used to assert the opposite - "restricting who can see must
     * not restrict who can register" - and so pinned the bug as behaviour.
     *
     * Registering is a SUBSET of seeing. A members-only event that anyone can
     * register for is not a permissive setting, it is an unreachable one: the
     * view gate runs first, so the non-members that "PUBLIC" invites never see
     * the page. The card asserted something it could not do.
     *
     * Narrowing view now pulls registration to the widest state still
     * honourable, which is view itself.
     */
    const latest = render();
    fireEvent.click(screen.getAllByRole("radio", { name: /All members/ })[0]);
    const d = latest();
    expect(d.viewability).toBe("MEMBERS_ONLY");
    expect(d.accessibility).toBe("MEMBERS_ONLY");
  });

  it("still lets registration be NARROWER than visibility", () => {
    // The ceiling only stops registration going wider. Seen by everyone and
    // sold to one tier is the case the whole feature exists for. View stays
    // on its default (Public); only the REGISTER axis's own "All members"
    // radio (the second one on the page) is clicked.
    const latest = render();
    const allMembersRadios = screen.getAllByRole("radio", { name: /All members/ });
    fireEvent.click(allMembersRadios[allMembersRadios.length - 1]);
    const d = latest();
    expect(d.viewability).toBe("PUBLIC");
    expect(d.accessibility).toBe("MEMBERS_ONLY");
  });
});

describe("opening an existing event", () => {
  it("shows a members-only event with no grants as All members", () => {
    // The no-backfill rule in the UI: every event predating this feature.
    render({ initialData: { viewability: "MEMBERS_ONLY", accessibility: "MEMBERS_ONLY" } });
    // Both controls render the row, hence getAll: one for see, one for register.
    const rows = screen.getAllByRole("radio", { name: /All members/ });
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toHaveAttribute("aria-checked", "true");
  });

  it("restores a saved tier selection", () => {
    render({
      initialData: { viewability: "MEMBERS_ONLY", accessibility: "PUBLIC" },
      initialViewTierIds: ["t1"],
    });
    // A saved subset (not "all") opens directly in "Specific tiers" mode, so
    // the checklist is already rendered — no need to click anything.
    const founding = screen.getAllByRole("checkbox", { name: /Founding/ })[0];
    const alumni = screen.getAllByRole("checkbox", { name: /Alumni/ })[0];
    expect(founding).toHaveAttribute("aria-checked", "true");
    expect(alumni).toHaveAttribute("aria-checked", "false");
  });
});

describe("a member host", () => {
  it("sees no access card at all", () => {
    // Removed, not disabled - the rule from the card split.
    render({ hideVisibility: true });
    expect(screen.queryByText("Who can see it")).toBeNull();
    expect(screen.queryByText("Community access")).toBeNull();
  });
});
