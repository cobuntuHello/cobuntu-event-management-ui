import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditHub } from "../components/PriceEditModal/EditHub";
import { blankTier } from "../components/PriceEditModal/helpers";
import type { DraftTier } from "../components/PriceEditModal/types";
import { renderWithConfig } from "./test-utils";

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

function renderHub(props: Partial<React.ComponentProps<typeof EditHub>> = {}) {
  return renderWithConfig(
    <EditHub
      t={newTier()}
      communityTag="c-1"
      onUpdate={() => {}}
      showMemberPricing={false}
      showToast={() => {}}
      {...props}
    />,
  );
}

describe("EditHub — landing view", () => {
  it("renders 3 section cards by default (Basics / Options / Form)", () => {
    renderHub();
    expect(screen.getByText("Basics")).toBeInTheDocument();
    expect(screen.getByText("Options")).toBeInTheDocument();
    expect(screen.getByText("Registration form")).toBeInTheDocument();
    expect(screen.queryByText("Member pricing")).not.toBeInTheDocument();
  });

  it("renders the Member pricing card when showMemberPricing is true", () => {
    renderHub({ showMemberPricing: true });
    expect(screen.getByText("Member pricing")).toBeInTheDocument();
  });

  it("describes the tier in the Basics card", () => {
    renderHub({
      t: newTier({ name: "VIP", price: "50", currency: "EUR" }),
    });
    expect(screen.getByText(/VIP · €50/)).toBeInTheDocument();
  });

  it("flags installment plans in the Basics description", () => {
    renderHub({
      t: newTier({ installmentEnabled: true, installmentTotal: "300", installmentCount: "3" }),
    });
    expect(screen.getByText(/Installment plan/)).toBeInTheDocument();
  });

  it("summarises capacity + pwyw + installments in the Options card", () => {
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

  it("flags an unsaved tier with the 'Save first' hint", () => {
    renderHub({ t: newTier({ id: undefined }) });
    expect(screen.getByText(/Save tier first to attach a form/)).toBeInTheDocument();
  });

  it("shows the lock banner when sales exist", () => {
    renderHub({ t: newTier({ salesCount: 3 }) });
    expect(
      screen.getByText(/3 tickets sold/),
    ).toBeInTheDocument();
  });
});

describe("EditHub — step navigation", () => {
  it("Edit on Basics opens the Basics step + Done returns to hub", async () => {
    const user = userEvent.setup();
    renderHub();
    // Step into Basics
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    expect(screen.getByRole("heading", { name: "Basics", level: 4 })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Standard, VIP, Early-bird…")).toBeInTheDocument();
    // Done → back to hub (4 SectionCard titles visible again)
    await user.click(screen.getByRole("button", { name: /Done/i }));
    expect(screen.queryByRole("heading", { name: "Basics", level: 4 })).not.toBeInTheDocument();
    // Now Basics is a card title again (not a heading), so the cards are back.
    expect(screen.getAllByRole("button", { name: /^Edit/ }).length).toBeGreaterThanOrEqual(3);
  });

  it("Back arrow returns to the hub from a step", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    expect(screen.getByRole("heading", { name: "Basics", level: 4 })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Back to hub"));
    expect(screen.queryByRole("heading", { name: "Basics", level: 4 })).not.toBeInTheDocument();
  });

  it("Edit on Options opens the Options step with capacity input", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[1]);
    expect(screen.getByRole("heading", { name: "Options", level: 4 })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("∞")).toBeInTheDocument();
  });

  it("disables Edit on Members + Form when the tier is unsaved", () => {
    renderHub({ t: newTier({ id: undefined }), showMemberPricing: true });
    const editButtons = screen.getAllByRole("button", { name: /^Edit/ });
    // Order: Basics, Options, Members, Form. Basics + Options stay
    // enabled; Members + Form are gated until save.
    expect(editButtons[0]).not.toBeDisabled();
    expect(editButtons[1]).not.toBeDisabled();
    expect(editButtons[2]).toBeDisabled();
    expect(editButtons[3]).toBeDisabled();
  });
});

describe("EditHub — Basics step ↔ Billing radio", () => {
  it("toggling Installment plan in the radio flips draft.installmentEnabled", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderHub({ onUpdate });
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    await user.click(screen.getByLabelText(/Installment plan/));
    expect(onUpdate).toHaveBeenCalledWith({ installmentEnabled: true });
  });

  it("does not surface a Recurring option (events run mode=payment)", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getAllByRole("button", { name: /^Edit/ })[0]);
    expect(screen.queryByLabelText(/Recurring/)).not.toBeInTheDocument();
  });
});
