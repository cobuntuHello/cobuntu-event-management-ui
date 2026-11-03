import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, render } from "@testing-library/react";
import { EventForm, type EventFormData } from "../components/EventForm";
import { CategoryPickerRow } from "../components/CategoryPickerRow";
import { LocationAddButtons, locationRowError, makeLocation } from "../ui/event-locations-field";
import { renderWithConfig } from "./test-utils";

/**
 * The event form and the primitives it composes speak the HOST's language.
 *
 * EventForm renders inside the create wizard AND on the manage surface, and
 * both reach the host translator through EventManagementConfig.t (or the
 * wizard's copy.t, the same context). These were hard-coded English, so a pt-PT
 * community got an English form inside an otherwise Portuguese wizard.
 *
 * With a host `t`, every string is asked for by its fully qualified key; with
 * none, the English that rendered before is unchanged.
 */

const hostT = (key: string, values?: Record<string, unknown>) =>
  values && Object.keys(values).length ? `PT:${key}:${JSON.stringify(values)}` : `PT:${key}`;

const categories = [{ id: "c1", name: "Ceramics", subcategories: [] }];

describe("form area with a host translator", () => {
  it("EventForm asks the host for its copy by fully qualified key", async () => {
    renderWithConfig(<EventForm communityTag="c-1" page="listing" />, { config: { t: hostT } });
    expect(await screen.findByPlaceholderText("PT:eventsUi.manageUi.eventForm.namePlaceholder")).toBeInTheDocument();
    expect(screen.getByText("PT:eventsUi.manageUi.eventForm.addBanner")).toBeInTheDocument();
    expect(screen.getByText("PT:eventsUi.manageUi.eventForm.addLocation")).toBeInTheDocument();
    // The timestamps primitive inside the form goes through the same translator.
    expect(screen.getByText("PT:eventsUi.manageUi.eventTimestamps.start")).toBeInTheDocument();
    // No English left on the listing page's own labels.
    expect(screen.queryByText("Add banner")).toBeNull();
  });

  it("the default ticket tier is named in the host's language", async () => {
    const onChange = vi.fn();
    renderWithConfig(<EventForm communityTag="c-1" page="commerce" onChange={onChange} />, { config: { t: hostT } });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const data = onChange.mock.calls.at(-1)![0] as EventFormData;
    expect(data.tiers[0].name).toBe("PT:eventsUi.manageUi.eventForm.tierStandard");
  });

  it("CategoryPickerRow passes the noun through for the host to inflect", () => {
    renderWithConfig(
      <CategoryPickerRow categories={categories} categoryId={null} subCategoryId={null} onChange={() => {}} noun="event" />,
      { config: { t: hostT } },
    );
    expect(screen.getByText("PT:eventsUi.manageUi.categoryPickerRow.chooseCategory")).toBeInTheDocument();
    expect(screen.getByText('PT:eventsUi.manageUi.categoryPickerRow.discoverHint:{"noun":"event"}')).toBeInTheDocument();
  });

  it("location buttons and the non-hook row validator use the host translator", () => {
    renderWithConfig(<LocationAddButtons onAdd={() => {}} />, { config: { t: hostT } });
    expect(screen.getByText("PT:eventsUi.manageUi.eventLocationsField.addPlace")).toBeInTheDocument();
    // getEventT mirrors the provider that just rendered.
    expect(locationRowError(makeLocation("ONLINE"))).toBe("PT:eventsUi.manageUi.eventLocationsField.errAddLink");
  });
});

describe("form area without a host translator", () => {
  it("EventForm renders the English it always did", async () => {
    renderWithConfig(<EventForm communityTag="c-1" page="listing" />);
    expect(await screen.findByPlaceholderText("Event Name")).toBeInTheDocument();
    expect(screen.getByText("Add banner")).toBeInTheDocument();
    expect(screen.getByText("Let's start with the basics")).toBeInTheDocument();
    expect(screen.getByText("Start")).toBeInTheDocument();
  });

  it("formats plurals and placeholders in the English defaults", async () => {
    renderWithConfig(
      <EventForm
        communityTag="c-1"
        page="commerce"
        initialData={{
          tiers: [{
            localId: "a", name: "VIP", description: "", price: "0", currency: "EUR", capacity: "12",
            isRecurring: false, recurringInterval: "monthly", draftForm: { fields: [{}] }, publishedAt: null,
          }],
        }}
      />,
    );
    expect(await screen.findByText("12 spots")).toBeInTheDocument();
    expect(screen.getByText("1 question")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("CategoryPickerRow and location buttons render English with no provider", () => {
    render(<CategoryPickerRow categories={categories} categoryId={null} subCategoryId={null} onChange={() => {}} noun="event" />);
    expect(screen.getByText("Choose a category")).toBeInTheDocument();
    expect(screen.getByText("Help people discover your event.")).toBeInTheDocument();
    render(<LocationAddButtons onAdd={() => {}} />);
    expect(screen.getByText("Add online link")).toBeInTheDocument();
  });
});
