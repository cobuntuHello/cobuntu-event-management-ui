/**
 * T-320: "Date to be announced" in the package.
 *
 * The server keeps a dateless event display only (nobody can get a place until
 * it has a date). These pin the package's half: the switch in EventTimestamps,
 * the manage modal sending the server's "clear the schedule" signal (BOTH dates
 * null; a single null means "no change" there), and the publish-readiness
 * mirror exempting a dateless event from the tier rule exactly as the server
 * does.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { EventTimestamps } from "../ui/event-timestamps";
import { DateTimeEditModal } from "../components/DateTimeEditModal";
import { getEventStatus } from "../page/helpers";
import { renderWithConfig, mockFetch } from "./test-utils";

function Timestamps({ initialTba = false, onTba = vi.fn() }: { initialTba?: boolean; onTba?: (v: boolean) => void }) {
  const [tba, setTba] = useState(initialTba);
  return (
    <EventTimestamps
      startDate={new Date("2027-03-12T00:00:00Z")} endDate={new Date("2027-03-12T00:00:00Z")}
      startTime="19:00" endTime="22:00" timezone="Europe/Lisbon"
      onStartDateChange={() => {}} onEndDateChange={() => {}}
      onStartTimeChange={() => {}} onEndTimeChange={() => {}} onTimezoneChange={() => {}}
      tba={tba} onTbaChange={(v) => { setTba(v); onTba(v); }}
    />
  );
}

describe("EventTimestamps, Date to be announced", () => {
  it("offers the switch only when the caller opts in", () => {
    render(
      <EventTimestamps
        startDate={null} endDate={null} startTime="19:00" endTime="22:00" timezone="UTC"
        onStartDateChange={() => {}} onEndDateChange={() => {}}
        onStartTimeChange={() => {}} onEndTimeChange={() => {}} onTimezoneChange={() => {}}
      />,
    );
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("hides the pickers and says why while it is on, and gives them back when off", async () => {
    const user = userEvent.setup();
    const onTba = vi.fn();
    render(<Timestamps onTba={onTba} />);

    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.queryByText(/Nobody can sign up or buy a ticket/)).toBeNull();

    await user.click(screen.getByRole("switch", { name: "Date to be announced" }));
    expect(onTba).toHaveBeenLastCalledWith(true);
    expect(screen.queryByText("Start")).toBeNull();
    expect(screen.getByText(/Nobody can sign up or buy a ticket until you set a date/)).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Date to be announced" }));
    expect(onTba).toHaveBeenLastCalledWith(false);
    expect(screen.getByText("Start")).toBeInTheDocument();
  });
});

describe("DateTimeEditModal, Date to be announced", () => {
  const props = (event: Record<string, unknown>) => ({
    event, communityTag: "c-1", onClose: vi.fn(), onSaved: vi.fn(), showToast: vi.fn(),
  });

  it("clears the schedule with BOTH dates null when the host switches it on", async () => {
    const fetchMock = mockFetch([{ method: "PUT", url: "/events/evt-1", body: { ok: true } }]);
    const user = userEvent.setup();
    const p = props({ id: "evt-1", startDate: "2027-06-01T15:00:00Z", endDate: "2027-06-01T17:00:00Z", timezone: "UTC" });
    renderWithConfig(<DateTimeEditModal {...p} />);

    await user.click(screen.getByRole("switch", { name: "Date to be announced" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(p.onSaved).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ startDate: null, endDate: null, timezone: "UTC" });
  });

  it("opens ON for an event that has no date, with Save available", () => {
    renderWithConfig(<DateTimeEditModal {...props({ id: "evt-2", startDate: null, endDate: null, timezone: "UTC" })} />);
    expect(screen.getByRole("switch", { name: "Date to be announced" })).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
  });

  it("shows the server's refusal (someone already has a place) and does not report a save", async () => {
    mockFetch([{
      method: "PUT", url: "/events/evt-1", status: 400,
      body: { error: "People already have a place on this event, so its date cannot be removed. Move the date instead." },
    }]);
    const user = userEvent.setup();
    const p = props({ id: "evt-1", startDate: "2027-06-01T15:00:00Z", endDate: "2027-06-01T17:00:00Z", timezone: "UTC" });
    renderWithConfig(<DateTimeEditModal {...p} />);

    await user.click(screen.getByRole("switch", { name: "Date to be announced" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(p.showToast).toHaveBeenCalledWith(expect.stringMatching(/already have a place/)));
    expect(p.onSaved).not.toHaveBeenCalled();
  });
});

describe("getEventStatus, publish readiness", () => {
  const draftTiers = [{ id: "t1", publishedAt: null, archivedAt: null }];

  it("does not ask a dateless event to publish a tier: it sells nothing until dated", () => {
    const s = getEventStatus({ name: "Supper", startDate: null, endDate: null, tiers: draftTiers });
    expect(s.missingRequirements).not.toContain("publish at least one ticket tier");
  });

  it("still asks a dated event to publish a tier", () => {
    const s = getEventStatus({
      name: "Supper", startDate: "2027-06-01T15:00:00Z", endDate: "2027-06-01T17:00:00Z", tiers: draftTiers,
    });
    expect(s.missingRequirements).toContain("publish at least one ticket tier");
  });
});
