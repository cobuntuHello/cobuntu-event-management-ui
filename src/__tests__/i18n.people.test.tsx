import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { PromoteAttendeeModal } from "../components/PromoteAttendeeModal";
import { ConfirmRemoveHostModal } from "../components/hosts/ConfirmRemoveHostModal";
import { HostChip } from "../components/hosts/HostChip";
import { renderActivitySentence, formatRelativeTime } from "../components/activity/activitySentences";
import { WizardCopyProvider } from "../create-wizard/i18n";
import { PEOPLE_MESSAGES_EN } from "../i18n/messages/people";

/**
 * The people area (attendees, add/invite modals, hosts, listings, revenue
 * KPIs, the activity feed) speaks the HOST's language.
 *
 * These were literals, so a pt-PT community (Finance Social Club) read every
 * attendee row, host prompt and activity sentence in English. They now
 * resolve through EventManagementConfig.t by fully qualified key, falling
 * back to the package's English when the host passes none.
 */

const hostT = (key: string, values?: Record<string, unknown>) =>
  `PT:${key}${values && "count" in values ? `:${values.count}` : ""}`;

const eligible = [{ id: "att-1", userId: "u-1", name: "Alice", usertag: "alice", status: "APPROVED" }];
const promoteProps = { eventId: "evt-1", eligibleAttendees: eligible, open: true, onClose: vi.fn(), onPromoted: vi.fn() };
const host = { id: "h-1", userId: "u-1", user: { id: "u-1", name: "Alice", usertag: "alice" } };
const removeTarget = { userId: "u-1", user: { name: "Alice" }, hasAttendance: true, hasManageEventsRole: false };

describe("with a host translator", () => {
  const config = { t: hostT as any };

  it("PromoteAttendeeModal asks for its keys", () => {
    renderWithConfig(<PromoteAttendeeModal {...promoteProps} />, { config });
    expect(screen.getByText("PT:eventsUi.manageUi.promoteAttendeeModal.title")).toBeInTheDocument();
    expect(screen.getByText("PT:eventsUi.manageUi.promoteAttendeeModal.subtitlePick")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("PT:eventsUi.manageUi.promoteAttendeeModal.searchPlaceholder")).toBeInTheDocument();
  });

  it("ConfirmRemoveHostModal and HostChip ask for their keys", () => {
    renderWithConfig(
      <>
        <ConfirmRemoveHostModal open onClose={vi.fn()} onConfirm={vi.fn()} target={removeTarget} isSelf={false} />
        <HostChip host={host} isImmutableCreator={false} hasAttendance={false} canManage onRequestRemove={vi.fn()} />
      </>,
      { config },
    );
    expect(screen.getByText("PT:eventsUi.manageUi.confirmRemoveHostModal.titleDemote")).toBeInTheDocument();
    expect(screen.getByText("PT:eventsUi.manageUi.confirmRemoveHostModal.cancel")).toBeInTheDocument();
    expect(screen.getByText("PT:eventsUi.manageUi.hostChip.remove")).toBeInTheDocument();
  });

  it("activity sentences and relative times go through the host translator", () => {
    render(
      <WizardCopyProvider copy={{ t: hostT as any }}>
        <span />
      </WizardCopyProvider>,
    );
    const entry = { source: "EVENT_AUDIT" as const, action: "INVITATIONS_SENT", actor: null, payload: { count: 3 } };
    expect(renderActivitySentence(entry).text).toBe("PT:eventsUi.manageUi.activitySentences.guestsInvited:3");
    const now = new Date("2026-11-03T12:00:00Z");
    expect(formatRelativeTime("2026-11-03T11:55:00Z", now)).toBe("PT:eventsUi.manageUi.activitySentences.minutesAgo:5");
  });
});

describe("without a host translator", () => {
  it("renders today's English", () => {
    renderWithConfig(
      <>
        <PromoteAttendeeModal {...promoteProps} />
        <ConfirmRemoveHostModal open onClose={vi.fn()} onConfirm={vi.fn()} target={removeTarget} isSelf={false} />
      </>,
    );
    expect(screen.getAllByText("Promote to host").length).toBeGreaterThan(0);
    expect(screen.getByText("Pick a paid attendee. Their registration stays in place; they'll be added as a host.")).toBeInTheDocument();
    expect(screen.getByText("Demote Alice to attendee?")).toBeInTheDocument();
    expect(screen.getByText("They'll stop being a host but their event registration and any payment stay on file.")).toBeInTheDocument();
  });

  it("activity sentences keep their English, plurals included", () => {
    // A fresh provider WITHOUT t resets the non-hook mirror to English.
    render(
      <WizardCopyProvider>
        <span />
      </WizardCopyProvider>,
    );
    const sent = (count: number) =>
      renderActivitySentence({ source: "EVENT_AUDIT", action: "INVITATIONS_SENT", actor: { id: "u", name: "Bea", usertag: null, profileImage: null }, payload: { count } }).text;
    expect(sent(1)).toBe("Bea invited 1 guest");
    expect(sent(4)).toBe("Bea invited 4 guests");
    expect(
      renderActivitySentence({ source: "SALE", action: "PURCHASED", actor: null, payload: { buyerEmail: "a@b.c", amount: 2400, currency: "EUR", quantity: 1 } }).text,
    ).toBe("a@b.c bought a ticket for €24.00");
    expect(
      renderActivitySentence({ source: "EVENT_AUDIT", action: "EVENT_UPDATED", actor: null, payload: { fields: ["name", "date", "location"] } }).text,
    ).toBe("Someone updated the event (name, date, and location)");
  });

  it("every people message is a non-empty string", () => {
    for (const [ns, msgs] of Object.entries(PEOPLE_MESSAGES_EN.eventsUi.manageUi)) {
      for (const [k, v] of Object.entries(msgs as Record<string, string>)) {
        expect(typeof v === "string" && v.length > 0, `${ns}.${k}`).toBe(true);
      }
    }
  });
});
