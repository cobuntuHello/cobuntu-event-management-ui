import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { OverviewActionCards } from "../page/sections/OverviewActionCards";
import { hasPaidSales } from "../page/sections/EventActionsBar";

const src = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

describe("Delete locks on real sales", () => {
  const status = (isPaid: boolean, attendeeCount: number) => ({ isPaid, attendeeCount });

  it("a priced event with attendees but zero sales is NOT locked", () => {
    expect(hasPaidSales({ _count: { sales: 0 } }, status(true, 7))).toBe(false);
  });
  it("any sale locks it", () => {
    expect(hasPaidSales({ _count: { sales: 1 } }, status(false, 0))).toBe(true);
  });
  it("without the backend count it keeps the old conservative guess", () => {
    expect(hasPaidSales({}, status(true, 7))).toBe(true);
    expect(hasPaidSales({}, status(true, 0))).toBe(false);
    expect(hasPaidSales({}, status(false, 7))).toBe(false);
  });
});

describe("the actions sit above the tabs", () => {
  it("EventManagePage mounts the bar before the tab strip", () => {
    const page = src("../page/EventManagePage.tsx");
    expect(page.indexOf("<EventActionsBar")).toBeGreaterThan(-1);
    expect(page.indexOf("<EventActionsBar")).toBeLessThan(page.indexOf("<SectionsNav"));
  });
  it("DetailsView no longer renders them", () => {
    const details = src("../page/views/DetailsView.tsx");
    expect(details).not.toContain("<OverviewActionCards");
    expect(details).not.toContain("<SettingsDrawer");
  });
});

describe("the cards are one side-scrolling row", () => {
  const props = {
    isPublished: true, isEventPast: false, isEventLive: false, hasPaidAttendees: false, groupChatExists: false,
    onShare: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(), onPublish: vi.fn(), onUnpublish: vi.fn(),
    onDelete: vi.fn(), onGroupChat: vi.fn(), onPrivateHire: vi.fn(), onEventAddons: vi.fn(),
  };
  it("scrolls sideways instead of wrapping to a second row", () => {
    const { container } = renderWithConfig(<OverviewActionCards {...props} />);
    const row = container.querySelector("[data-edge-left]") as HTMLElement;
    expect(row.className).toContain("overflow-x-auto");
    expect(row.className).not.toContain("grid");
    expect(screen.getAllByRole("button").length).toBeGreaterThan(5);
  });
  it("starts with no left fade (nothing is scrolled off yet)", () => {
    const { container } = renderWithConfig(<OverviewActionCards {...props} />);
    expect((container.querySelector("[data-edge-left]") as HTMLElement).dataset.edgeLeft).toBe("false");
  });
});

describe("the description has no heading", () => {
  it("drops the title and subtitle", () => {
    const section = src("../page/sections/DescriptionSection.tsx");
    expect(section).not.toContain('t("title")');
    expect(section).not.toContain('t("subtitle")');
  });
});
