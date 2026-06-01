import { describe, it, expect, vi } from "vitest";
import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SchedulingSection,
  deriveScheduleState,
} from "../components/SchedulingSection";

/**
 * SchedulingSection — per-tier publish + auto-schedule editor.
 *
 * What's pinned here:
 *  • Status chip reflects derived state (Draft / Scheduled / On sale /
 *    Closed) so a host glancing at the card knows the current effective
 *    behavior without reading the toggles.
 *  • Publish toggle materialises an ISO timestamp on flip-on and clears
 *    publishedAt on flip-off; flip-off also wipes auto-schedule + the
 *    window so the host doesn't have to clean up by hand.
 *  • Auto-schedule disclosure: the start/end inputs only appear when
 *    the host opts in.
 *  • Cross-field validation: salesEndAt must be strictly after
 *    salesStartAt.
 *  • deriveScheduleState is a pure function — covered by truth table
 *    so the chip + state stay in lockstep with the BE helper.
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
      deriveScheduleState(
        { ...baseDraft, publishedAt: "2026-06-01T12:01:00.000Z" },
        NOW,
      ),
    ).toBe("scheduled");
  });

  it("publishedAt in past + salesStartAt in future → scheduled", () => {
    expect(
      deriveScheduleState(
        {
          ...baseDraft,
          publishedAt: "2026-05-31T12:00:00.000Z",
          salesStartAt: "2026-06-01T12:01:00.000Z",
        },
        NOW,
      ),
    ).toBe("scheduled");
  });

  it("salesEndAt in past → closed-ended", () => {
    expect(
      deriveScheduleState(
        {
          ...baseDraft,
          publishedAt: "2026-05-31T12:00:00.000Z",
          salesEndAt: "2026-06-01T11:59:00.000Z",
        },
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

describe("SchedulingSection — interactions", () => {
  it("status chip renders 'Draft' when publishedAt is null", () => {
    render(<SchedulingSection draft={baseDraft} onChange={vi.fn()} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("status chip renders 'On sale' when published with no window", () => {
    render(
      <SchedulingSection
        draft={{ ...baseDraft, publishedAt: new Date(Date.now() - 60_000).toISOString() }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("On sale")).toBeInTheDocument();
  });

  it("Publish toggle on → emits publishedAt timestamp", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SchedulingSection draft={baseDraft} onChange={onChange} />);

    await user.click(screen.getByLabelText("Publish & schedule"));

    expect(onChange).toHaveBeenCalled();
    const patch = onChange.mock.calls[0][0];
    expect(patch.publishedAt).toBeTruthy();
    expect(typeof patch.publishedAt).toBe("string");
  });

  it("Publish toggle off → clears publishedAt + auto-schedule + window", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SchedulingSection
        draft={{
          publishedAt: new Date(Date.now() - 60_000).toISOString(),
          autoScheduleEnabled: true,
          salesStartAt: new Date(Date.now()).toISOString(),
          salesEndAt: new Date(Date.now() + 60_000).toISOString(),
        }}
        onChange={onChange}
      />,
    );

    // The publish toggle is the first checkbox; click it.
    const publishCheckbox = screen.getByLabelText("Publish & schedule");
    await user.click(publishCheckbox);

    expect(onChange).toHaveBeenCalledWith({
      publishedAt: null,
      autoScheduleEnabled: false,
      salesStartAt: "",
      salesEndAt: "",
    });
  });

  it("auto-schedule date inputs are hidden until the toggle is on", () => {
    render(
      <SchedulingSection
        draft={{ ...baseDraft, publishedAt: new Date(Date.now() - 60_000).toISOString() }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Sales open")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sales close")).not.toBeInTheDocument();
  });

  it("auto-schedule date inputs appear when the toggle is on", () => {
    render(
      <SchedulingSection
        draft={{
          ...baseDraft,
          publishedAt: new Date(Date.now() - 60_000).toISOString(),
          autoScheduleEnabled: true,
        }}
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
