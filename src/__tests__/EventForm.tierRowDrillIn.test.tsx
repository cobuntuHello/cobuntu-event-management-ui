import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventForm } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * The ticket tier row is a DRILL-IN, matching the product variant row.
 *
 * It used to be a div holding a button and a publish Switch side by side,
 * because the two cannot be nested — a button wrapping a switch is invalid
 * HTML and fires both handlers on one click. That split was the tell: the row
 * could not be a drill-in while it also carried a control, so only half of it
 * was clickable and it lacked the chevron every other row in this wizard has.
 *
 * The switch was REMOVED rather than moved: TierEditView already renders
 * publish state in its own section, and PriceEditModal passes
 * `onTogglePublish` unconditionally — so it is present in the create wizard
 * too, not only on the manage page. A copy on the row was one control writing
 * another's value.
 */

const TIER = {
  localId: "t1",
  name: "General",
  description: "",
  price: "20",
  currency: "EUR",
  capacity: "40",
  isRecurring: false,
  recurringInterval: "monthly" as const,
  priceMode: "fixed" as const,
  pwywMin: "",
  installmentEnabled: false,
  installmentTotal: "",
  installmentCount: "",
  installmentInterval: "",
  autoScheduleEnabled: false,
  salesStartAt: "",
  salesEndAt: "",
  publishedAt: new Date().toISOString(),
};

const draft = (over: Record<string, unknown> = {}) => ({ ...TIER, ...over });

function renderForm(tiers: unknown[]) {
  return renderWithConfig(
    <EventForm communityTag="c-1" onChange={vi.fn()} initialData={{ tiers } as any} />,
  );
}

describe("EventForm — the ticket tier row", () => {
  beforeEach(() => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: true, chargesEnabled: true } }]);
  });

  it("carries no publish switch — the row is not a place to publish from", () => {
    // The specific control that was removed. Its aria-label was
    // `Publish ${name}`, so it is findable by name if it comes back.
    renderForm([draft()]);
    expect(screen.queryByRole("switch", { name: /publish general/i })).not.toBeInTheDocument();
  });

  it("is ONE button covering the whole row, so the whole row opens the editor", async () => {
    /*
     * Previously the row was a div and only its left half was a button. Tapping
     * near the right edge did nothing, which is why the chevron was missing —
     * there was nothing to promise.
     */
    const user = userEvent.setup();
    renderForm([draft()]);

    const row = screen.getByRole("button", { name: /General/ });
    await user.click(row);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });

  it("offers the publish control INSIDE the editor, in the create wizard", async () => {
    /*
     * The reason removing the row switch loses nothing. If PriceEditModal ever
     * stops passing `onTogglePublish` (it is optional on TierEditView), this
     * fails — and it should, because that would leave no way to publish a tier
     * from the wizard at all.
     */
    const user = userEvent.setup();
    renderForm([draft()]);

    await user.click(screen.getByRole("button", { name: /General/ }));
    const dialog = await screen.findByRole("dialog");

    await waitFor(() =>
      expect(within(dialog).getByRole("switch", { name: /published/i })).toBeInTheDocument(),
    );
  });

  it("still says a tier is a Draft, because that is information and not a control", () => {
    // An unpublished tier is one buyers cannot see. Removing the switch should
    // not mean you have to open the editor to find that out.
    renderForm([draft({ publishedAt: null })]);
    expect(screen.getByRole("button", { name: /Draft/ })).toBeInTheDocument();
  });

  it("does not label a published tier, since published is the unremarkable state", () => {
    renderForm([draft()]);
    const row = screen.getByRole("button", { name: /General/ });
    expect(within(row).queryByText(/Draft/)).not.toBeInTheDocument();
  });
});
