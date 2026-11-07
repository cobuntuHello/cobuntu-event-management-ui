import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { DeleteModal } from "../components/DeleteModal";
import { PublishModal } from "../components/PublishModal";
import { OverviewActionCards } from "../page/sections/OverviewActionCards";
import { SectionsNav } from "../page/sections/SectionsNav";
import { OVERVIEW_MESSAGES_EN } from "../i18n/messages/overview";

/**
 * The overview area (manage page shell, Overview card, agenda/updates views,
 * the quick-edit and settings modals) speaks the HOST's language.
 *
 * A pt-PT community (Finance Social Club) saw every one of these screens in
 * English because the strings were literals. They now resolve through
 * EventManagementConfig.t by fully qualified key, falling back to the
 * package's English when the host passes none.
 */

const hostT = (key: string, values?: Record<string, unknown>) =>
  `PT:${key}${values && "count" in values ? `:${values.count}` : ""}`;

const event = { id: "evt-1", name: "Big party", startDate: "2026-06-01T18:00:00Z", bannerUrl: null };
const cardProps = {
  isPublished: false,
  isEventPast: false,
  isEventLive: false,
  hasPaidAttendees: false,
  onShare: vi.fn(),
  onEdit: vi.fn(),
  onDuplicate: vi.fn(),
  onPublish: vi.fn(),
  onUnpublish: vi.fn(),
  onDelete: vi.fn(),
  groupChatExists: false,
  onGroupChat: vi.fn(),
  onPrivateHire: vi.fn(),
  onEventAddons: vi.fn(),
};

describe("with a host translator", () => {
  it("DeleteModal asks the host for its title, plural count and buttons", () => {
    renderWithConfig(
      <DeleteModal event={event} isPaid={false} attendeeCount={3} onClose={vi.fn()} onConfirm={vi.fn()} />,
      { config: { t: hostT } },
    );
    expect(screen.getByText("PT:eventsUi.manageUi.deleteModal.title")).toBeInTheDocument();
    expect(screen.getByText("PT:eventsUi.manageUi.deleteModal.registeredCount:3")).toBeInTheDocument();
    expect(screen.getByText("PT:eventsUi.manageUi.overviewCommon.cancel")).toBeInTheDocument();
    expect(screen.queryByText("Delete event")).not.toBeInTheDocument();
  });

  it("OverviewActionCards and the tab strip render translated labels", () => {
    renderWithConfig(
      <>
        <OverviewActionCards {...cardProps} />
        <SectionsNav communityTag="x" activeView="overview" onViewChange={vi.fn()} />
      </>,
      { config: { t: hostT } },
    );
    expect(screen.getByText("PT:eventsUi.manageUi.overviewActionCards.share")).toBeInTheDocument();
    expect(screen.getByText("PT:eventsUi.manageUi.sectionsNav.overview")).toBeInTheDocument();
    expect(screen.queryByText("Share Event")).not.toBeInTheDocument();
  });

  it("PublishModal translates the publish requirements it lists", () => {
    renderWithConfig(
      <PublishModal
        event={event}
        communityTag="x"
        isPublished={false}
        isPaid={false}
        attendeeCount={0}
        missingRequirements={["add a title"]}
        onClose={vi.fn()}
        onDone={vi.fn()}
        showToast={vi.fn()}
      />,
      { config: { t: (k: string, v?: Record<string, unknown>) => (v?.requirements ? `PT:${k}[${v.requirements}]` : `PT:${k}`) } },
    );
    expect(
      screen.getByText(
        "PT:eventsUi.manageUi.publishModal.mustBefore[PT:eventsUi.manageUi.publishRequirements.addTitle]",
      ),
    ).toBeInTheDocument();
  });
});

describe("without a host translator", () => {
  it("renders today's English", () => {
    renderWithConfig(
      <>
        <DeleteModal event={event} isPaid={false} attendeeCount={1} onClose={vi.fn()} onConfirm={vi.fn()} />
        <OverviewActionCards {...cardProps} />
        <SectionsNav communityTag="x" activeView="overview" onViewChange={vi.fn()} />
      </>,
    );
    expect(screen.getByText("Delete event")).toBeInTheDocument();
    expect(screen.getByText("1 person is registered")).toBeInTheDocument();
    expect(screen.getByText("Share Event")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("pluralises the registered count in English", () => {
    renderWithConfig(
      <DeleteModal event={event} isPaid={false} attendeeCount={4} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByText("4 people are registered")).toBeInTheDocument();
  });

  it("every overview message is a non-empty string", () => {
    for (const ns of Object.values(OVERVIEW_MESSAGES_EN.eventsUi.manageUi)) {
      for (const v of Object.values(ns as Record<string, string>)) expect(typeof v === "string" && v.length > 0).toBe(true);
    }
  });
});
