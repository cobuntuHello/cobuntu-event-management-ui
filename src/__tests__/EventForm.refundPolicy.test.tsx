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

/**
 * When the COMMUNITY owns the terms, the host does not choose (T-296).
 *
 * A venue publishes one cancellation policy and every event booked there
 * inherits it. Asking a host hiring a room to pick their own refund rules was
 * the wrong question, and the answer was silently dropped on create anyway
 * until T-296 fixed that in the backend.
 */
describe("EventForm — the house cancellation terms", () => {
  const HOUSE = [
    { days: 14, pct: 75 },
    { days: 7, pct: 50 },
    { days: 0, pct: 0 },
  ];

  beforeEach(() => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: false } }]);
  });

  it("states the terms and removes the picker entirely", () => {
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={vi.fn()} page="settings" houseRefundBands={HOUSE} />,
    );
    expect(screen.getByText("Refunds")).toBeInTheDocument();
    expect(screen.getByText("14 or more days before: 75% back")).toBeInTheDocument();
    // Not disabled, GONE. A greyed-out control invites a hunt for the
    // permission that would re-enable it.
    expect(screen.queryByRole("button", { name: /Standard refunds/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /No self-service refunds/i })).not.toBeInTheDocument();
  });

  it("says what the schedule does not cover", () => {
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={vi.fn()} page="settings" houseRefundBands={HOUSE} />,
    );
    expect(screen.getByText(/cancelled by the venue, everyone is refunded in full/)).toBeInTheDocument();
  });

  it("names the house when the community gives a title", () => {
    renderWithConfig(
      <EventForm
        communityTag="c-1"
        onChange={vi.fn()}
        page="settings"
        houseRefundBands={HOUSE}
        houseRefundTitle="TEJÁ's cancellation terms"
      />,
    );
    expect(screen.getByText("TEJÁ's cancellation terms")).toBeInTheDocument();
  });

  it("leaves the picker exactly as it was for a community with no house terms", () => {
    // Every community today. Nothing about this step changes for them.
    const noHouseTerms: ({ days: number; pct: number }[] | null | undefined)[] = [undefined, null, []];
    for (const bands of noHouseTerms) {
      const { unmount } = renderWithConfig(
        <EventForm communityTag="c-1" onChange={vi.fn()} page="settings" houseRefundBands={bands} />,
      );
      expect(screen.getByRole("button", { name: /Standard refunds/i })).toBeInTheDocument();
      unmount();
    }
  });
});
