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
 * It's now a pure navigation MENU of tiles (Details / Basics / Member
 * pricing / Registration form) — no editable fields, no inline Save.
 * Identity (name + capacity) lives in the Details step. So this surface
 * is: which tiles render, their summaries, and card click → onEnterStep.
 * Back / Delete / Duplicate / Published live in the outer modal footer.
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
      onEnterStep={() => {}}
      {...props}
    />,
  );
}

describe("TierHubView — tile menu", () => {
  it("renders Details + Basics + Registration form by default", () => {
    renderHub();
    expect(screen.getByRole("heading", { name: "Details", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Basics", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registration form", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Member pricing", level: 3 })).not.toBeInTheDocument();
    // No editable fields / inline Save on the hub anymore.
    expect(screen.queryByPlaceholderText("Standard, VIP, Early-bird…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
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

  it("Basics card folds in pwyw + installment; Details card shows capacity", () => {
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
    expect(screen.getByText(/PWYW/)).toBeInTheDocument();
    expect(screen.getByText(/Installment plan/)).toBeInTheDocument();
    // Capacity now summarised on the Details tile (it's edited in the step).
    expect(screen.getByText(/Capacity 100/)).toBeInTheDocument();
  });

  it("shows the lock banner when sales exist", () => {
    renderHub({ t: newTier({ salesCount: 3 }) });
    expect(screen.getByText(/3 tickets sold/)).toBeInTheDocument();
  });

  it("clicking a tile fires onEnterStep with its id", async () => {
    const onEnterStep = vi.fn();
    renderHub({ onEnterStep });
    await userEvent.click(screen.getByRole("button", { name: /Details/ }));
    expect(onEnterStep).toHaveBeenCalledWith("details");
    await userEvent.click(screen.getByRole("button", { name: /Basics/ }));
    expect(onEnterStep).toHaveBeenCalledWith("basics");
  });

  it("Members + Form tiles are disabled (non-button) on an unsaved tier", () => {
    renderHub({ t: newTier({ id: undefined }), showMemberPricing: true });
    // Details + Basics are always editable (no saved id needed); Members +
    // Form require a saved tier id so they drop out of the button role.
    expect(screen.getByRole("button", { name: /Details/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Basics/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Member pricing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registration form/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Member pricing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registration form" })).toBeInTheDocument();
  });
});
