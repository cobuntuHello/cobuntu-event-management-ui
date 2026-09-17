/**
 * Donations on the EVENT create-wizard pricing step.
 *
 * Ported wholesale from cobuntu-product-management-ui, because these two
 * packages carry byte-identical copies of the donations editor and the
 * products one had already been fixed. The port is the point: the bug below
 * only ever existed on events because the fix was applied to one copy.
 * Consolidating the two is tracked separately.
 *
 * The redesign this pins: the switch lives on the ROW, and the modal opens
 * only once there is something in it.
 *
 * Before, the row was a pure drill-in and the switch lived inside the dialog.
 * `DonationsSection` is a header plus `<Collapse open={enabled}>`, so with
 * donations off there was nothing to collapse open and the modal was one
 * switch with two different ways to close it. Every complaint about that
 * dialog followed from it being empty: the dead space, the ✕-plus-Close pair,
 * the right-aligned Close sitting where a primary action goes.
 *
 * It was also the odd one out on its own step, where "Require approval" and
 * "Can be bought more than once" are inline toggle rows.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DonationsField } from "../components/PriceEditModal/DonationsField";
import type { DonationDraft } from "../components/PriceEditModal/types";

afterEach(() => cleanup());

const draft = (over: Partial<DonationDraft> = {}): DonationDraft => ({
  enabled: false,
  mode: "fixed",
  amounts: [""],
  minAmount: "",
  label: "",
  currency: "EUR",
  ...(over as any),
});

function setup(over: Partial<DonationDraft> = {}) {
  const onUpdate = vi.fn();
  render(<DonationsField donation={draft(over)} onUpdate={onUpdate} defaultCurrency="EUR" />);
  return { onUpdate, user: userEvent.setup() };
}

describe("DonationsField — the row owns the switch", () => {
  it("enables donations from the row, without opening anything", async () => {
    // The whole point: one tap, the same as the toggle rows beside it.
    const { onUpdate, user } = setup();

    await user.click(screen.getByRole("switch", { name: /enable donations/i }));

    expect(onUpdate).toHaveBeenCalledWith({ enabled: true });
    expect(screen.queryByText(/how buyers give/i)).not.toBeInTheDocument();
  });

  it("offers NO way into the modal while donations are off", async () => {
    /*
     * A chevron promises a destination. While this is off the only thing
     * behind it is the switch the reader just walked past, so there must be
     * no Edit affordance at all — that is the empty dialog, prevented at the
     * source rather than styled around.
     */
    setup({ enabled: false });
    expect(screen.queryByRole("button", { name: /edit donation settings/i })).not.toBeInTheDocument();
  });

  it("states its STATE when off, rather than pitching the feature", () => {
    // Its neighbours describe what they currently do; this row now matches.
    setup({ enabled: false });
    expect(screen.getByText(/^Off ·/)).toBeInTheDocument();
  });
});

describe("DonationsField — the modal, once there is something in it", () => {
  it("opens from Edit and shows the real settings", async () => {
    const { user } = setup({ enabled: true, amounts: ["5", "10"] });

    await user.click(screen.getByRole("button", { name: /edit donation settings/i }));

    expect(screen.getByText(/how buyers give/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^suggested amounts$/i })).toBeInTheDocument();
  });

  it("does not repeat the row that opened it", async () => {
    /*
     * The section renders its own header + switch for the manage page. In this
     * modal that would be a duplicate of the row behind it, and a SECOND
     * control for the same value — so it is suppressed via `hideHeader`.
     */
    const { user } = setup({ enabled: true, amounts: ["5"] });
    await user.click(screen.getByRole("button", { name: /edit donation settings/i }));

    const dialogSwitches = screen.getAllByRole("switch", { name: /enable donations/i });
    expect(dialogSwitches).toHaveLength(1);
  });

  it("has exactly ONE dismissal, and it is the bottom Close", async () => {
    /*
     * House rule: a top-right ✕ belongs to a modal that owns a primary action
     * and needs a secondary escape. This form auto-saves through `onUpdate`,
     * so dismissal is the whole story. It previously had BOTH, leaving the
     * reader to choose between two controls that did the same thing.
     */
    const { user } = setup({ enabled: true, amounts: ["5"] });
    await user.click(screen.getByRole("button", { name: /edit donation settings/i }));

    // Exactly one, not "at least one" — the defect was having two.
    expect(screen.getAllByRole("button", { name: /^close$/i })).toHaveLength(1);
    // And the old icon ✕ (which carried aria-label="Close") is gone.
    expect(screen.queryByLabelText("Close")).not.toBeInTheDocument();
  });

  it("closes on Close", async () => {
    const { user } = setup({ enabled: true, amounts: ["5"] });
    await user.click(screen.getByRole("button", { name: /edit donation settings/i }));
    expect(screen.getByText(/how buyers give/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^close$/i }));
    expect(screen.queryByText(/how buyers give/i)).not.toBeInTheDocument();
  });

  it("turning donations OFF while the editor is open closes it", async () => {
    /*
     * Otherwise the reader is stranded in a dialog whose body has just
     * collapsed to nothing — the very state this redesign removes.
     */
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <DonationsField donation={draft({ enabled: true, amounts: ["5"] })} onUpdate={onUpdate} defaultCurrency="EUR" />,
    );

    await user.click(screen.getByRole("button", { name: /edit donation settings/i }));
    expect(screen.getByText(/how buyers give/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole("switch", { name: /enable donations/i })[0]);
    expect(onUpdate).toHaveBeenCalledWith({ enabled: false });

    // The parent re-renders with the new value; the editor must be gone.
    rerender(
      <DonationsField donation={draft({ enabled: false })} onUpdate={onUpdate} defaultCurrency="EUR" />,
    );
    expect(screen.queryByText(/how buyers give/i)).not.toBeInTheDocument();
  });
});

describe("DonationsField — the row summarises the live config", () => {
  it("lists the suggested amounts", () => {
    setup({ enabled: true, amounts: ["5", "10", "25"] });
    expect(screen.getByText("€5 · €10 · €25")).toBeInTheDocument();
  });

  it("reports a pay-what-you-want minimum", () => {
    setup({ enabled: true, mode: "pwyw", minAmount: "3" });
    expect(screen.getByText("Any amount · min €3")).toBeInTheDocument();
  });

  it("reports an unbounded pay-what-you-want", () => {
    setup({ enabled: true, mode: "pwyw", minAmount: "" });
    expect(screen.getByText("Any amount")).toBeInTheDocument();
  });
});

describe("DonationsField — the copy is an EVENT's copy", () => {
  /*
   * The products package says "variant"; an event sells TICKET TIERS. Both
   * copies of this component said "variant" before the port, because the file
   * was duplicated verbatim and the noun was never localised — which is the
   * duplication problem showing up as a user-visible wording bug rather than a
   * behavioural one.
   *
   * Pinned so the next person who copies the file across notices.
   */
  it("never says variant on the row", () => {
    /*
     * The off-state row summarises the STATE ("Off - buyers can add a
     * contribution at checkout") and names no tier noun at all, so this only
     * asserts the absence. The positive assertion belongs to the modal below,
     * where the explainer actually lives.
     */
    setup({ enabled: false });
    expect(screen.queryByText(/variant/i)).not.toBeInTheDocument();
  });

  it("says ticket tier, never variant, inside the modal", async () => {
    const { user } = setup({ enabled: true, amounts: ["5"] });
    await user.click(screen.getByRole("button", { name: /edit donation settings/i }));
    expect(screen.getByText(/for every ticket tier/i)).toBeInTheDocument();
    expect(screen.queryByText(/variant/i)).not.toBeInTheDocument();
  });
});
