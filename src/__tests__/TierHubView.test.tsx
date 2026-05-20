import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TierHubView } from "../components/PriceEditModal/TierHubView";
import { blankTier } from "../components/PriceEditModal/helpers";
import type { DraftTier } from "../components/PriceEditModal/types";
import { renderWithConfig } from "./test-utils";

/**
 * TierHubView — Level 2 of the 3-level takeover modal. Pure prop-driven
 * render: shows tier name + delete + duplicate at top, 4 SectionCards
 * below. Clicking Edit on a card calls onEnterStep — handled at the
 * modal level (Level 3 step takeover).
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
      canDuplicate={true}
      canDelete={true}
      onUpdate={() => {}}
      onEnterStep={() => {}}
      onDuplicate={() => {}}
      onRemove={() => {}}
      onBack={() => {}}
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
    // First call is the first keypress — value is "GAX" (text-input concat).
    expect(onUpdate.mock.calls[0][0].name).toMatch(/^GA/);
  });

  it("shows the lock banner when sales exist", () => {
    renderHub({ t: newTier({ salesCount: 3 }) });
    expect(screen.getByText(/3 tickets sold/)).toBeInTheDocument();
  });

  it("disables Members + Form Edit buttons on unsaved tier", () => {
    renderHub({ t: newTier({ id: undefined }), showMemberPricing: true });
    const editButtons = screen.getAllByRole("button", { name: /^Edit/ });
    // Order: Basics / Options / Members / Form
    expect(editButtons[0]).not.toBeDisabled();
    expect(editButtons[1]).not.toBeDisabled();
    expect(editButtons[2]).toBeDisabled();
    expect(editButtons[3]).toBeDisabled();
  });

  it("clicking Edit on a card calls onEnterStep with the step id", async () => {
    const onEnterStep = vi.fn();
    renderHub({ onEnterStep });
    await userEvent.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    expect(onEnterStep).toHaveBeenCalledWith("basics");
  });

  it("clicking 'Back to tiers' calls onBack", async () => {
    const onBack = vi.fn();
    renderHub({ onBack });
    await userEvent.click(screen.getByRole("button", { name: /Back to tiers/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it("clicking Duplicate calls onDuplicate (only when canDuplicate)", async () => {
    const onDuplicate = vi.fn();
    renderHub({ onDuplicate });
    await userEvent.click(screen.getByRole("button", { name: /^Duplicate$/ }));
    expect(onDuplicate).toHaveBeenCalled();
  });

  it("clicking Delete calls onRemove (only when canDelete and unlocked)", async () => {
    const onRemove = vi.fn();
    renderHub({ onRemove });
    await userEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    expect(onRemove).toHaveBeenCalled();
  });

  it("Delete button is disabled when tier is locked (salesCount > 0)", () => {
    renderHub({ t: newTier({ salesCount: 1 }) });
    expect(screen.getByRole("button", { name: /^Delete$/ })).toBeDisabled();
  });
});
