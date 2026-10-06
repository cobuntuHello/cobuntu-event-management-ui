import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { EventForm } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * The refund policy, chosen inline in the "Policies & access" (settings) step with
 * the SAME RefundPolicyField the manage modal uses (T-234). Two presets: Standard
 * (null) and No self-service refunds (customBuyerWindowDays: 0).
 */
function lastEmit(onChange: ReturnType<typeof vi.fn>) {
  const calls = onChange.mock.calls;
  return calls.length ? calls[calls.length - 1][0] : null;
}

describe("EventForm — refund policy", () => {
  beforeEach(() => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: false } }]);
  });

  it("shows the Refunds control on the settings page, not on commerce", () => {
    const { rerender } = renderWithConfig(<EventForm communityTag="c-1" onChange={vi.fn()} page="settings" />);
    expect(screen.getByText("Refunds")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Standard refunds/i })).toBeInTheDocument();

    rerender(<EventForm communityTag="c-1" onChange={vi.fn()} page="commerce" />);
    expect(screen.queryByText("Refunds")).not.toBeInTheDocument();
  });

  it("emits null (Standard) by default and customBuyerWindowDays:0 when set to none", () => {
    const onChange = vi.fn();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} page="settings" />);
    expect(lastEmit(onChange).refundPolicy).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /No self-service refunds/i }));
    expect(lastEmit(onChange).refundPolicy).toEqual({ mode: "default", customBuyerWindowDays: 0 });
  });
});
