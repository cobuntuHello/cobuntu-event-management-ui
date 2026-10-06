import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { EventForm } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * The `page` prop splits the form across wizard steps, mirroring ProductForm's
 * `page`:
 *   - "listing"  → the event's own details only.
 *   - "commerce" → ticket tiers ("Event Options") + donations + attendees + access.
 *   - "settings" → "Policies & access": the Require-Approval gate (refund later).
 *   - "all" (default) → everything on one page, so the manage/edit drawer and any
 *     single-page consumer are unchanged.
 *
 * Require-Approval moved from commerce to settings so the commerce step is only
 * the pricing group. State is shared regardless of page, so a wizard mounts ONE
 * form and flips `page` between steps without losing what was typed.
 */
describe("EventForm — page split", () => {
  beforeEach(() => {
    // useStripeStatus fetches /stripe/connected on mount.
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: false } }]);
  });

  it("default (page='all') shows the details, the pricing group, and approval", () => {
    renderWithConfig(<EventForm communityTag="c-1" />);
    expect(screen.getByPlaceholderText("Event Name")).toBeTruthy();
    expect(screen.getByText("Event Options")).toBeTruthy();
    expect(screen.getByText(/Require Approval/)).toBeTruthy();
  });

  it("page='listing' shows details, hides the pricing group + approval", () => {
    renderWithConfig(<EventForm communityTag="c-1" page="listing" />);
    expect(screen.getByPlaceholderText("Event Name")).toBeTruthy();
    expect(screen.queryByText("Event Options")).toBeNull();
    expect(screen.queryByText(/Require Approval/)).toBeNull();
  });

  it("page='commerce' shows the pricing group, hides details AND approval", () => {
    renderWithConfig(<EventForm communityTag="c-1" page="commerce" />);
    expect(screen.queryByPlaceholderText("Event Name")).toBeNull();
    expect(screen.getByText("Event Options")).toBeTruthy();
    // Approval moved to the "Policies & access" (settings) step.
    expect(screen.queryByText(/Require Approval/)).toBeNull();
  });

  it("page='settings' shows approval, hides the pricing group + details", () => {
    renderWithConfig(<EventForm communityTag="c-1" page="settings" />);
    expect(screen.queryByPlaceholderText("Event Name")).toBeNull();
    expect(screen.queryByText("Event Options")).toBeNull();
    expect(screen.getByText(/Require Approval/)).toBeTruthy();
  });
});
