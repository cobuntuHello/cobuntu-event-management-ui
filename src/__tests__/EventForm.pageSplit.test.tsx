import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { EventForm } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * The `page` prop splits the form so a wizard can put pricing (ticket tiers) and
 * the host's approval gate on their OWN step, mirroring ProductForm's `page`:
 *   - "listing"  → the event's own details only.
 *   - "commerce" → ticket tiers + Require Approval only.
 *   - "all" (default) → everything on one page, so the manage/edit drawer and
 *     any single-page consumer are unchanged.
 *
 * State is shared regardless of page, so a wizard mounts ONE form and flips
 * `page` between steps without losing what was typed.
 */
describe("EventForm — page split", () => {
  beforeEach(() => {
    // useStripeStatus fetches /stripe/connected on mount.
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: false } }]);
  });

  it("default (page='all') shows both the details and the pricing/approval sections", () => {
    renderWithConfig(<EventForm communityTag="c-1" />);
    expect(screen.getByPlaceholderText("Event Name")).toBeTruthy();
    expect(screen.getByText("Tickets")).toBeTruthy();
    expect(screen.getByText(/Require Approval/)).toBeTruthy();
  });

  it("page='listing' shows details, hides pricing + approval", () => {
    renderWithConfig(<EventForm communityTag="c-1" page="listing" />);
    expect(screen.getByPlaceholderText("Event Name")).toBeTruthy();
    expect(screen.queryByText("Tickets")).toBeNull();
    expect(screen.queryByText(/Require Approval/)).toBeNull();
  });

  it("page='commerce' shows pricing + approval, hides details", () => {
    renderWithConfig(<EventForm communityTag="c-1" page="commerce" />);
    expect(screen.queryByPlaceholderText("Event Name")).toBeNull();
    expect(screen.getByText("Tickets")).toBeTruthy();
    expect(screen.getByText(/Require Approval/)).toBeTruthy();
  });
});
