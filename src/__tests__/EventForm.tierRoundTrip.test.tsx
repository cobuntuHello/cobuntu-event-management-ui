import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventForm } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * The TierItem round-trip is a field allowlist in BOTH directions —
 * tiersToDrafts on the way in, handleTiersCommit on the way out. Anything not
 * named in both is silently discarded when the tier modal closes.
 *
 * That cost pay-what-you-want, installment plans and sales windows: a host
 * configured them, the modal showed them back, and closing it reverted the
 * lot. The backend accepted all of it; the loss was entirely in this hop.
 *
 * These tests go through the real modal rather than calling the mapper,
 * because the mapper is exactly the thing that looked fine in isolation.
 */

const TIER_WITH_EVERYTHING = {
  localId: "t1",
  name: "General",
  description: "",
  price: "20",
  currency: "EUR",
  capacity: "40",
  isRecurring: false,
  recurringInterval: "monthly" as const,
  priceMode: "pwyw" as const,
  pwywMin: "10",
  installmentEnabled: true,
  installmentTotal: "120",
  installmentCount: "3",
  installmentInterval: "1",
  autoScheduleEnabled: true,
  salesStartAt: "2026-09-01T10:00",
  salesEndAt: "2026-09-30T10:00",
  publishedAt: new Date().toISOString(),
};

describe("EventForm — tier fields survive the modal round-trip", () => {
  beforeEach(() => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: true, chargesEnabled: true } }]);
  });

  it("keeps pricing model, plan and sales window when the modal is saved", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={onChange}
        initialData={{ tiers: [TIER_WITH_EVERYTHING] } as any} />,
    );

    // Open the tier and save it straight back — the round-trip alone used to
    // be enough to lose everything below.
    await user.click(screen.getByRole("button", { name: /General/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const t = onChange.mock.calls.at(-1)?.[0].tiers[0];
    expect(t.priceMode).toBe("pwyw");
    expect(t.pwywMin).toBe("10");
    expect(t.installmentEnabled).toBe(true);
    expect(t.installmentTotal).toBe("120");
    expect(t.installmentCount).toBe("3");
    expect(t.installmentInterval).toBe("1");
    expect(t.autoScheduleEnabled).toBe(true);
    expect(t.salesStartAt).toBe("2026-09-01T10:00");
    expect(t.salesEndAt).toBe("2026-09-30T10:00");
  });

  it("still keeps the fields that already worked", async () => {
    // Guard against a widened allowlist dropping something that was fine.
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithConfig(
      <EventForm communityTag="c-1" onChange={onChange}
        initialData={{ tiers: [TIER_WITH_EVERYTHING] } as any} />,
    );

    await user.click(screen.getByRole("button", { name: /General/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const t = onChange.mock.calls.at(-1)?.[0].tiers[0];
    expect(t.name).toBe("General");
    expect(t.capacity).toBe("40");
    expect(t.price).toBe("20");
    expect(t.publishedAt).toBeTruthy();
  });
});
