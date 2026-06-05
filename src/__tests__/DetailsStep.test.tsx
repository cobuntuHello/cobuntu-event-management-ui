import { describe, it, expect, vi } from "vitest";
import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailsStep } from "../components/PriceEditModal/steps/DetailsStep";
import { blankTier } from "../components/PriceEditModal/helpers";
import type { DraftTier } from "../components/PriceEditModal/types";

/**
 * DetailsStep — the tier identity fields (name + capacity) that used to
 * live inline on the hub with a misleading "Save". They're a normal step
 * now, committed by the shared footer Save like every other step.
 */
function tier(overrides: Partial<DraftTier> = {}): DraftTier {
  return { ...blankTier("EUR", 1), id: "t1", name: "GA", ...overrides };
}

describe("DetailsStep", () => {
  it("renders the name + capacity fields with current values", () => {
    render(<DetailsStep t={tier({ name: "VIP", capacity: "30" })} onUpdate={vi.fn()} />);
    expect((screen.getByPlaceholderText("Standard, VIP, Early-bird…") as HTMLInputElement).value).toBe("VIP");
    expect((screen.getByPlaceholderText("Unlimited") as HTMLInputElement).value).toBe("30");
  });

  it("calls onUpdate for name + capacity edits", async () => {
    const onUpdate = vi.fn();
    render(<DetailsStep t={tier({ name: "", capacity: "" })} onUpdate={onUpdate} />);
    await userEvent.type(screen.getByPlaceholderText("Standard, VIP, Early-bird…"), "A");
    expect(onUpdate.mock.calls.some((c) => "name" in c[0])).toBe(true);
    await userEvent.type(screen.getByPlaceholderText("Unlimited"), "5");
    expect(onUpdate.mock.calls.some((c) => "capacity" in c[0])).toBe(true);
  });

  it("description is a multi-line textarea with the right max length", () => {
    render(<DetailsStep t={tier({ description: "Brunch + talk" })} onUpdate={vi.fn()} />);
    const desc = screen.getByPlaceholderText("What's included") as HTMLTextAreaElement;
    expect(desc.tagName).toBe("TEXTAREA");
    expect(desc.value).toBe("Brunch + talk");
    expect(desc.maxLength).toBe(200);
  });

  it("name input is capped at 80 characters", () => {
    render(<DetailsStep t={tier()} onUpdate={vi.fn()} />);
    const name = screen.getByPlaceholderText("Standard, VIP, Early-bird…") as HTMLInputElement;
    expect(name.maxLength).toBe(80);
  });

  it("shows live character counters for name + description", () => {
    render(<DetailsStep t={tier({ name: "GA", description: "hi" })} onUpdate={vi.fn()} />);
    expect(screen.getByText("2/80")).toBeInTheDocument();   // name "GA"
    expect(screen.getByText("2/200")).toBeInTheDocument();  // description "hi"
  });

  it("renders ⓘ help affordances for the fields", () => {
    render(<DetailsStep t={tier()} onUpdate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Help: Tier name/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Help: Description/i })).toBeInTheDocument();
  });

  it("clicking a ⓘ reveals its explainer popover", async () => {
    render(<DetailsStep t={tier()} onUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Help: Tier name/i }));
    expect(
      await screen.findByText(/public label buyers see at checkout/i),
    ).toBeInTheDocument();
  });
});
