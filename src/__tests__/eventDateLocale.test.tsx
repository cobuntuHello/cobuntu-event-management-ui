import * as React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WizardCopyProvider } from "../create-wizard/i18n";
import { eventDateLocale, formatEventDate, formatEventTime } from "../page/helpers";

/**
 * Manage-page dates follow the host's language.
 *
 * They were hard-wired to "en-US", so Impact Hub Porto's Portuguese event page
 * read "Friday, December 11 / 12:30 PM - 2:00 PM" (Nov 2026). The locale now
 * comes from the host's messages (`eventsUi.manageUi.dateLocale.locale`).
 */

// Midday UTC, so the calendar day is the same in any test-runner timezone.
const ISO = "2026-12-11T12:30:00.000Z";

function Probe() {
  // Helpers read the translator mirrored during render, as the manage page's do.
  return (
    <p data-testid="out">
      {eventDateLocale()} | {formatEventDate(ISO)} | {formatEventTime(ISO)}
    </p>
  );
}

function withLocale(value: string) {
  const t = (key: string) => (key === "eventsUi.manageUi.dateLocale.locale" ? value : key);
  return render(<WizardCopyProvider copy={{ t }}><Probe /></WizardCopyProvider>);
}

describe("manage-page dates", () => {
  it("writes a Portuguese host's dates in Portuguese, on a 24-hour clock", () => {
    withLocale("pt-PT");
    const out = screen.getByTestId("out").textContent ?? "";
    expect(out).toContain("pt-PT |");
    expect(out).toMatch(/dezembro/i);
    expect(out).not.toMatch(/December|AM|PM/);
  });

  it("keeps English exactly as before when the host has no translator", () => {
    render(<WizardCopyProvider><Probe /></WizardCopyProvider>);
    const out = screen.getByTestId("out").textContent ?? "";
    expect(out).toContain("en-US |");
    expect(out).toMatch(/December 11/);
    expect(out).toMatch(/(AM|PM)/);
  });

  it("falls back to English when the host returns something that is not a locale", () => {
    // next-intl renders a missing key as its own path.
    withLocale("eventsUi.manageUi.dateLocale.locale");
    expect(screen.getByTestId("out").textContent).toContain("en-US |");
  });
});
