import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StepView } from "../components/PriceEditModal/StepView";
import { blankTier } from "../components/PriceEditModal/helpers";
import type { DraftTier } from "../components/PriceEditModal/types";

/**
 * Capacity — the Unlimited switch.
 *
 * "How do I set capacity to unlimited?" (2026-08-09). It was already possible,
 * by leaving the field blank, but nothing said so except a placeholder — a
 * member had no way to tell a deliberate choice from a forgotten field.
 *
 * The stored shape did NOT change: `capacity: ""` still means unlimited, which
 * is what every consumer reads. These tests pin that, plus the two behaviours
 * that would break quietly: the sold-units floor, and the local mode state not
 * leaking between tiers.
 */

function tier(overrides: Partial<DraftTier> = {}): DraftTier {
  return { ...blankTier({ currency: "EUR" }), ...overrides } as DraftTier;
}

function renderCapacity(t: DraftTier) {
  const onUpdate = vi.fn();
  const utils = render(
    <StepView t={t} step="capacity" communityTag="orbis" onUpdate={onUpdate} />,
  );
  return { onUpdate, ...utils };
}

const unlimitedSwitch = () => screen.getByRole("switch", { name: /unlimited capacity/i });

describe("capacity step — Unlimited switch", () => {
  it("starts Unlimited when capacity is blank, and hides the number input", () => {
    renderCapacity(tier({ capacity: "" }));

    expect(unlimitedSwitch()).toHaveAttribute("aria-checked", "true");
    // No input to fill in: an empty number field next to an "on" Unlimited
    // switch is the ambiguity this replaced.
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("starts limited when capacity has a value, and shows it", () => {
    renderCapacity(tier({ capacity: "40" }));

    expect(unlimitedSwitch()).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("spinbutton")).toHaveValue(40);
  });

  it("turning Unlimited on clears the capacity", async () => {
    // "" is the stored form of unlimited — the contract with every consumer.
    const user = userEvent.setup();
    const { onUpdate } = renderCapacity(tier({ capacity: "40" }));

    await user.click(unlimitedSwitch());

    expect(onUpdate).toHaveBeenCalledWith({ capacity: "" });
  });

  it("turning Unlimited off seeds a real number rather than leaving it blank", async () => {
    // A blank value would still read as unlimited downstream, so "limited"
    // has to start from something concrete.
    const user = userEvent.setup();
    const { onUpdate } = renderCapacity(tier({ capacity: "" }));

    await user.click(unlimitedSwitch());

    const patch = onUpdate.mock.calls.at(-1)?.[0];
    expect(patch.capacity).not.toBe("");
    expect(Number(patch.capacity)).toBeGreaterThan(0);
  });

  it("keeps the input visible while the number is being retyped", async () => {
    // Deriving the mode from `capacity` alone would make the field vanish the
    // moment someone selects-all and deletes to retype it.
    const user = userEvent.setup();
    // SAME localId across the rerender — that is what really happens when the
    // user edits one tier (updateDraft patches it in place). A different id
    // would remount the step and reset the mode, which is the separate
    // behaviour covered by the last test.
    const base = tier({ localId: "same-tier", capacity: "40" });
    const { rerender } = render(
      <StepView t={base} step="capacity" communityTag="orbis" onUpdate={vi.fn()} />,
    );

    await user.clear(screen.getByRole("spinbutton"));
    rerender(
      <StepView t={{ ...base, capacity: "" }} step="capacity" communityTag="orbis" onUpdate={vi.fn()} />,
    );

    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    expect(unlimitedSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("floors the input at the number already sold", async () => {
    // Capacity below sold units would oversell a tier buyers already hold.
    const t = tier({ id: "tier-1", capacity: "10", salesCount: 4 });
    renderCapacity(t);

    expect(screen.getByRole("spinbutton")).toHaveAttribute("min", "4");
    expect(screen.getByText(/Min 4 \(already sold\)/)).toBeInTheDocument();
  });

  it("still lets a tier with sales go Unlimited", async () => {
    // Removing a cap can never conflict with units already sold, so the switch
    // stays live on a locked tier.
    const user = userEvent.setup();
    const { onUpdate } = renderCapacity(tier({ id: "tier-1", capacity: "10", salesCount: 4 }));

    expect(unlimitedSwitch()).not.toBeDisabled();
    await user.click(unlimitedSwitch());
    expect(onUpdate).toHaveBeenCalledWith({ capacity: "" });
  });

  it("does not carry one tier's mode over to the next", async () => {
    // The mode is local state; without a key it would survive the tier swap
    // and show tier B as limited because tier A was.
    const a = tier({ localId: "a", capacity: "25" });
    const b = tier({ localId: "b", capacity: "" });

    const { rerender } = render(
      <StepView t={a} step="capacity" communityTag="orbis" onUpdate={vi.fn()} />,
    );
    expect(unlimitedSwitch()).toHaveAttribute("aria-checked", "false");

    rerender(<StepView t={b} step="capacity" communityTag="orbis" onUpdate={vi.fn()} />);
    expect(unlimitedSwitch()).toHaveAttribute("aria-checked", "true");
  });
});
