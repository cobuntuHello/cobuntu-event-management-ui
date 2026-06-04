import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TierHubView } from "../components/PriceEditModal/TierHubView";
import { blankTier } from "../components/PriceEditModal/helpers";
import type { DraftTier } from "../components/PriceEditModal/types";
import { renderWithConfig } from "./test-utils";

/**
 * TierHubView — Level 2 of the 3-level takeover modal.
 *
 * Prop-driven: shows tier-name input + an inline Save (renaming is this
 * step's primary action) + 4 fully-clickable SectionCards in a 2×2 grid.
 * Back / Duplicate / Delete live in the outer modal footer — so this
 * test surface is: input, inline Save, summaries, card click → onEnterStep.
 */

function newTier(overrides: Partial<DraftTier> = {}): DraftTier {
  return {
    ...blankTier("EUR", 1),
    id: "tier-1",
    name: "GA",
    price: "10",
    currency: "EUR",
    ...overrides,
  };
}

function renderHub(props: Partial<React.ComponentProps<typeof TierHubView>> = {}) {
  return renderWithConfig(
    <TierHubView
      t={newTier()}
      showMemberPricing={false}
      onUpdate={() => {}}
      onEnterStep={() => {}}
      onSave={() => {}}
      {...props}
    />,
  );
}

describe("TierHubView — landing summary", () => {
  it("renders 3 section cards by default (Basics / Options / Form)", () => {
    renderHub();
    expect(screen.getByRole("heading", { name: "Basics", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Options", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registration form", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Member pricing", level: 3 })).not.toBeInTheDocument();
  });

  it("renders the Member pricing card when showMemberPricing is true", () => {
    renderHub({ showMemberPricing: true });
    expect(screen.getByRole("heading", { name: "Member pricing", level: 3 })).toBeInTheDocument();
  });

  it("Basics card description: price · billing summary", () => {
    renderHub({
      t: newTier({ price: "20", installmentEnabled: true, installmentTotal: "60", installmentCount: "3" }),
    });
    expect(screen.getByText(/€20 · Installment plan/)).toBeInTheDocument();
  });

  it("Options card summary: capacity + pwyw + installment", () => {
    renderHub({
      t: newTier({
        capacity: "100",
        priceMode: "pwyw",
        installmentEnabled: true,
        installmentTotal: "300",
        installmentCount: "3",
        installmentInterval: "1",
      }),
    });
    expect(screen.getByText(/Cap: 100/)).toBeInTheDocument();
    expect(screen.getByText(/Pay-what-you-want/)).toBeInTheDocument();
    expect(screen.getByText(/3× over 1 mo/)).toBeInTheDocument();
  });

  it("renders the tier name input as the prominent editor", () => {
    renderHub({ t: newTier({ name: "VIP" }) });
    const nameInput = screen.getByDisplayValue("VIP") as HTMLInputElement;
    expect(nameInput.placeholder).toBe("Standard, VIP, Early-bird…");
  });

  it("calls onUpdate when the tier name changes", async () => {
    const onUpdate = vi.fn();
    renderHub({ onUpdate });
    const nameInput = screen.getByDisplayValue("GA");
    await userEvent.type(nameInput, "X");
    expect(onUpdate).toHaveBeenCalled();
    expect(onUpdate.mock.calls[0][0].name).toMatch(/^GA/);
  });

  it("renders an inline Save beside the name input and fires onSave", async () => {
    const onSave = vi.fn();
    renderHub({ onSave });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalled();
  });

  it("shows the lock banner when sales exist", () => {
    renderHub({ t: newTier({ salesCount: 3 }) });
    expect(screen.getByText(/3 tickets sold/)).toBeInTheDocument();
  });

  it("each SectionCard is fully clickable — clicking the row fires onEnterStep", async () => {
    const onEnterStep = vi.fn();
    renderHub({ onEnterStep });
    // The whole Basics card renders as a button with the heading as
    // accessible name. No nested "Edit" button.
    await userEvent.click(screen.getByRole("button", { name: /Basics/ }));
    expect(onEnterStep).toHaveBeenCalledWith("basics");
  });

  it("Members + Form cards are disabled (non-button) on unsaved tier", () => {
    renderHub({ t: newTier({ id: undefined }), showMemberPricing: true });
    // Saved tiers: 4 cards = 4 buttons. Unsaved: Members + Form drop
    // out of the button role (rendered as aria-disabled divs).
    expect(screen.getByRole("button", { name: /Basics/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Options/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Member pricing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registration form/ })).not.toBeInTheDocument();
    // The text still renders as a heading inside the disabled card.
    expect(screen.getByRole("heading", { name: "Member pricing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registration form" })).toBeInTheDocument();
  });
});
