/**
 * T-377 (2026-11-22): the action strip above the tabs scrolls sideways, and a
 * faint 40px fade did not say so. Whichever edge still has more to show now
 * carries a wider fade and a round arrow button that scrolls the row.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { OverviewActionCards } from "../page/sections/OverviewActionCards";

const noop = vi.fn();
const base: any = {
  isPublished: true, isEventPast: false, isEventLive: false, hasPaidAttendees: false, groupChatExists: false,
  canConfigureSettings: true,
  onShare: noop, onSettings: noop, onDuplicate: noop, onGroupChat: noop, onPublish: noop, onUnpublish: noop,
  onDelete: noop, onPrivateHire: noop, onEventAddons: noop,
};

let widths = { scrollWidth: 1200, clientWidth: 600, scrollLeft: 0 };
const scrollBy = vi.fn();
const saved: Record<string, PropertyDescriptor | undefined> = {};

beforeEach(() => {
  widths = { scrollWidth: 1200, clientWidth: 600, scrollLeft: 0 };
  scrollBy.mockReset();
  for (const k of ["scrollWidth", "clientWidth", "scrollLeft"] as const) {
    saved[k] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, k);
    Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: () => widths[k], set: () => {} });
  }
  (HTMLElement.prototype as any).scrollBy = scrollBy;
});
afterEach(() => {
  for (const k of Object.keys(saved)) {
    const d = saved[k];
    if (d) Object.defineProperty(HTMLElement.prototype, k, d);
    else delete (HTMLElement.prototype as any)[k];
  }
  delete (HTMLElement.prototype as any).scrollBy;
});

describe("the action strip says it scrolls", () => {
  it("at the start: a right arrow only, and it scrolls the row forward", () => {
    const { container } = renderWithConfig(<OverviewActionCards {...base} />);
    expect(container.querySelector('[data-scroll-arrow="left"]')).toBeNull();
    const right = container.querySelector('[data-scroll-arrow="right"]') as HTMLButtonElement;
    expect(right).not.toBeNull();
    expect(right.getAttribute("aria-label")).toBe("Show more actions");
    fireEvent.click(right);
    expect(scrollBy).toHaveBeenCalledWith({ left: 480, behavior: "smooth" });
  });

  it("scrolled to the end: a left arrow only", () => {
    widths.scrollLeft = 600;
    const { container } = renderWithConfig(<OverviewActionCards {...base} />);
    const scroller = container.querySelector("[data-edge-left]") as HTMLElement;
    fireEvent.scroll(scroller);
    expect(container.querySelector('[data-scroll-arrow="right"]')).toBeNull();
    expect(container.querySelector('[data-scroll-arrow="left"]')).not.toBeNull();
    expect(screen.getByLabelText("Show earlier actions")).toBeTruthy();
  });

  it("everything fits: no arrows at all", () => {
    widths = { scrollWidth: 600, clientWidth: 600, scrollLeft: 0 };
    const { container } = renderWithConfig(<OverviewActionCards {...base} />);
    expect(container.querySelector("[data-scroll-arrow]")).toBeNull();
  });
});
