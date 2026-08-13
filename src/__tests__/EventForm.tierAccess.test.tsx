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
     */
    const latest = render();
    fireEvent.click(screen.getAllByRole("checkbox", { name: /Public/ })[0]);
    const d = latest();
    expect(d.viewability).toBe("MEMBERS_ONLY");
    expect(d.viewTierIds).toEqual([]);
  });

  it("keeps the two axes independent", () => {
    // Restricting who can see must not restrict who can register.
    const latest = render();
    fireEvent.click(screen.getAllByRole("checkbox", { name: /Public/ })[0]);
    const d = latest();
    expect(d.viewability).toBe("MEMBERS_ONLY");
    expect(d.accessibility).toBe("PUBLIC");
  });
});

describe("opening an existing event", () => {
  it("shows a members-only event with no grants as All members", () => {
    // The no-backfill rule in the UI: every event predating this feature.
    render({ initialData: { viewability: "MEMBERS_ONLY", accessibility: "MEMBERS_ONLY" } });
    // Both pickers render the row, hence getAll: one for see, one for register.
    const rows = screen.getAllByRole("checkbox", { name: /All members/ });
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toHaveAttribute("aria-checked", "true");
    // ...and the tier rows under them are frozen, because "all" implies them.
    expect(screen.getAllByRole("checkbox", { name: /Founding/ })[0]).toHaveAttribute("aria-disabled", "true");
  });

  it("restores a saved tier selection", () => {
    render({
      initialData: { viewability: "MEMBERS_ONLY", accessibility: "PUBLIC" },
      initialViewTierIds: ["t1"],
    });
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
