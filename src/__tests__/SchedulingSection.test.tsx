import { describe, it, expect, vi } from "vitest";
import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SchedulingSection,
  deriveScheduleState,
} from "../components/SchedulingSection";

/**
 * SchedulingSection — per-tier AUTO-SCHEDULE window editor.
 *
 * The publish toggle moved out of this component to the tier-hub (L2)
 * footer as an instant Switch, so it's no longer tested here. What's
 * pinned now:
 *  • Auto-schedule Switch flips autoScheduleEnabled; flipping off also
 *    wipes the window so a re-enable starts fresh.
 *  • Disclosure: the start/end date-time pickers only appear when the
 *    host opts in.
 *  • Cross-field validation: salesEndAt must be strictly after
 *    salesStartAt.
 *  • deriveScheduleState is a pure function — covered by a truth table
 *    so the footer status + state stay in lockstep with the BE helper.
 */

const baseDraft = {
  publishedAt: null as string | null,
  autoScheduleEnabled: false,
  salesStartAt: "",
  salesEndAt: "",
};

describe("deriveScheduleState", () => {
  const NOW = new Date("2026-06-01T12:00:00.000Z");

  it("publishedAt null → draft", () => {
    expect(deriveScheduleState({ ...baseDraft }, NOW)).toBe("draft");
  });

  it("publishedAt in the future → scheduled", () => {
    expect(
      deriveScheduleState({ ...baseDraft, publishedAt: "2026-06-01T12:01:00.000Z" }, NOW),
    ).toBe("scheduled");
  });

  it("publishedAt in past + salesStartAt in future → scheduled", () => {
    expect(
      deriveScheduleState(
        { ...baseDraft, publishedAt: "2026-05-31T12:00:00.000Z", salesStartAt: "2026-06-01T12:01:00.000Z" },
        NOW,
      ),
    ).toBe("scheduled");
  });

  it("salesEndAt in past → closed-ended", () => {
    expect(
      deriveScheduleState(
        { ...baseDraft, publishedAt: "2026-05-31T12:00:00.000Z", salesEndAt: "2026-06-01T11:59:00.000Z" },
        NOW,
      ),
    ).toBe("closed-ended");
  });

  it("published + within window → on-sale", () => {
    expect(
      deriveScheduleState(
        {
          ...baseDraft,
          publishedAt: "2026-05-31T12:00:00.000Z",
          salesStartAt: "2026-05-31T12:00:00.000Z",
          salesEndAt: "2026-06-02T12:00:00.000Z",
        },
        NOW,
      ),
    ).toBe("on-sale");
  });
});

describe("SchedulingSection — auto-schedule window", () => {
  it("does NOT render a publish control (moved to the L2 footer)", () => {
    render(<SchedulingSection draft={baseDraft} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/^Published$/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Publish & schedule")).not.toBeInTheDocument();
  });

  it("auto-schedule Switch on → emits autoScheduleEnabled: true", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SchedulingSection draft={baseDraft} onChange={onChange} />);

    await user.click(screen.getByRole("switch", { name: "Auto-schedule sales window" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ autoScheduleEnabled: true }),
    );
  });

  it("auto-schedule Switch off → clears the window", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SchedulingSection
        draft={{
          publishedAt: new Date(Date.now() - 60_000).toISOString(),
          autoScheduleEnabled: true,
          salesStartAt: new Date().toISOString(),
          salesEndAt: new Date(Date.now() + 60_000).toISOString(),
        }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("switch", { name: "Auto-schedule sales window" }));

    expect(onChange).toHaveBeenCalledWith({
      autoScheduleEnabled: false,
      salesStartAt: "",
      salesEndAt: "",
    });
  });

  it("date pickers are hidden until auto-schedule is on", () => {
    render(<SchedulingSection draft={baseDraft} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Sales open")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sales close")).not.toBeInTheDocument();
  });

  it("date pickers appear when auto-schedule is on", () => {
    render(
      <SchedulingSection
        draft={{ ...baseDraft, autoScheduleEnabled: true }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Sales open")).toBeInTheDocument();
    expect(screen.getByLabelText("Sales close")).toBeInTheDocument();
  });

  it("flags salesEndAt <= salesStartAt as invalid", () => {
    render(
      <SchedulingSection
        draft={{
          publishedAt: new Date(Date.now() - 60_000).toISOString(),
          autoScheduleEnabled: true,
          salesStartAt: "2026-06-05T12:00:00.000Z",
          salesEndAt: "2026-06-01T12:00:00.000Z",
        }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Sales close must be after sales open/i)).toBeInTheDocument();
  });
});
