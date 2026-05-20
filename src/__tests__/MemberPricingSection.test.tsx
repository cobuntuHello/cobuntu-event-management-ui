import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemberPricingSection } from "../components/MemberPricingSection";
import type {
  MemberPricingRow,
  MemberPricingTierState,
} from "../components/PriceEditModal/member-pricing";
import { renderWithConfig } from "./test-utils";

/**
 * MemberPricingSection is now a presentational component (state lifted
 * to PriceEditModal in the post-redesign polish pass). These tests
 * exercise its render contract: receives a per-tier state slot + a
 * row-change handler, calls back on user input. The end-to-end commit
 * flow is covered by PriceEditModal.member-pricing-roundtrip.test.tsx.
 */

function loadedState(rows: MemberPricingRow[]): MemberPricingTierState {
  return { loading: false, error: null, rows };
}

function makeRow(overrides: Partial<MemberPricingRow> = {}): MemberPricingRow {
  return {
    segmentId: "seg-1",
    segmentName: "VIPs",
    enabled: false,
    mode: "PERCENT_OFF",
    value: "",
    priority: "0",
    initial: { enabled: false, mode: "PERCENT_OFF", value: "", priority: "0" },
    ...overrides,
  };
}

describe("MemberPricingSection (presentational)", () => {
  it("renders the loading hint while state.loading is true", () => {
    renderWithConfig(
      <MemberPricingSection
        state={{ loading: true, error: null, rows: [] as never[] }}
        onRowChange={() => {}}
        currencySymbol="€"
      />,
    );
    expect(screen.getByText(/Loading member pricing/i)).toBeInTheDocument();
  });

  it("renders the error message when state.error is set", () => {
    renderWithConfig(
      <MemberPricingSection
        state={{ loading: false, error: "Could not load", rows: [] as never[] }}
        onRowChange={() => {}}
        currencySymbol="€"
      />,
    );
    expect(screen.getByText(/Could not load/)).toBeInTheDocument();
  });

  it("renders the no-segments empty state when rows is empty", () => {
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([])}
        onRowChange={() => {}}
        currencySymbol="€"
      />,
    );
    expect(screen.getByText(/No segments configured/i)).toBeInTheDocument();
  });

  it("renders a row per segment + the 'No override' hint when disabled", () => {
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([
          makeRow({ segmentId: "seg-1", segmentName: "VIPs" }),
          makeRow({ segmentId: "seg-2", segmentName: "Students" }),
        ])}
        onRowChange={() => {}}
        currencySymbol="€"
      />,
    );
    expect(screen.getByText("VIPs")).toBeInTheDocument();
    expect(screen.getByText("Students")).toBeInTheDocument();
    expect(screen.getAllByText(/No override/).length).toBe(2);
  });

  it("does not render a Save button (parent modal owns the commit)", () => {
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([makeRow()])}
        onRowChange={() => {}}
        currencySymbol="€"
      />,
    );
    expect(screen.queryByRole("button", { name: /Save/i })).not.toBeInTheDocument();
  });

  it("calls onRowChange when the enable checkbox flips", async () => {
    const onRowChange = vi.fn();
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([makeRow({ segmentId: "seg-1", segmentName: "VIPs" })])}
        onRowChange={onRowChange}
        currencySymbol="€"
      />,
    );
    await userEvent.click(screen.getByLabelText(/Offer member pricing for VIPs/));
    expect(onRowChange).toHaveBeenCalledWith(0, { enabled: true });
  });

  it("calls onRowChange when the value input changes", () => {
    const onRowChange = vi.fn();
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([
          makeRow({ enabled: true, mode: "PERCENT_OFF", value: "10" }),
        ])}
        onRowChange={onRowChange}
        currencySymbol="€"
      />,
    );
    const valueInput = screen.getByPlaceholderText("20") as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: "25" } });
    expect(onRowChange).toHaveBeenCalledWith(0, { value: "25" });
  });

  it("renders the inline 'unsaved' badge when at least one row is dirty", () => {
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([
          // initial.enabled=false but enabled=true → dirty
          makeRow({ enabled: true, mode: "PERCENT_OFF", value: "10" }),
        ])}
        onRowChange={() => {}}
        currencySymbol="€"
      />,
    );
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument();
  });

  it("disables the value input when mode is FREE", () => {
    renderWithConfig(
      <MemberPricingSection
        state={loadedState([makeRow({ enabled: true, mode: "FREE" })])}
        onRowChange={() => {}}
        currencySymbol="€"
      />,
    );
    const valueInput = screen.getByPlaceholderText("—") as HTMLInputElement;
    expect(valueInput).toBeDisabled();
  });
});
