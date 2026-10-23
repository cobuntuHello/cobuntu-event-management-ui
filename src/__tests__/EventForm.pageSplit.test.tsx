import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { EventForm } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * The `page` prop splits the form across wizard steps, mirroring ProductForm's
 * `page`:
 *   - "listing"  → the event's own details only.
 *   - "commerce" → ticket tiers + donations ONLY.
 *
 * The marker for "the pricing group is on screen" is the Add-ticket-tier
 * button, not a heading. It used to be the "Event Options" eyebrow, which was
 * removed along with the card it labelled: the step is already titled
 * "Pricing" and subtitled "Set your ticket tiers", so the eyebrow restated the
 * heading two lines above it. The Add button is better as a marker anyway --
 * it is the thing the group EXISTS to offer, and it is there whether or not
 * any tier has been added.
 *   - "settings" → "Policies & access": approval, attendees + location visibility,
 *     community access, and the refund policy.
 *   - "all" (default) → everything on one page, so the manage/edit drawer and any
 *     single-page consumer are unchanged.
 *
 * Approval AND the visibility/access controls moved from commerce to settings so
 * the Pricing step is only tickets + donations. State is shared regardless of
 * page, so a wizard mounts ONE form and flips `page` without losing what was typed.
 */
describe("EventForm — page split", () => {
  beforeEach(() => {
    // useStripeStatus fetches /stripe/connected on mount.
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: false } }]);
  });

  it("default (page='all') shows the details, the pricing group, and approval", () => {
    renderWithConfig(<EventForm communityTag="c-1" />);
    expect(screen.getByPlaceholderText("Event Name")).toBeTruthy();
    expect(screen.getByText("Add ticket tier")).toBeTruthy();
    expect(screen.getByText(/Require Approval/)).toBeTruthy();
  });

  it("page='listing' shows details, hides the pricing group + approval", () => {
    renderWithConfig(<EventForm communityTag="c-1" page="listing" />);
    expect(screen.getByPlaceholderText("Event Name")).toBeTruthy();
    expect(screen.queryByText("Add ticket tier")).toBeNull();
    expect(screen.queryByText(/Require Approval/)).toBeNull();
  });

  it("page='commerce' is tickets + donations only — no approval, no visibility", () => {
    renderWithConfig(<EventForm communityTag="c-1" page="commerce" />);
    expect(screen.queryByPlaceholderText("Event Name")).toBeNull();
    expect(screen.getByText("Add ticket tier")).toBeTruthy();
    // Moved to "Policies & access".
    expect(screen.queryByText(/Require Approval/)).toBeNull();
    expect(screen.queryByText(/Who can see the guest list/)).toBeNull();
    expect(screen.queryByText(/Who can see the location/)).toBeNull();
  });

  it("page='settings' shows approval + visibility/access, hides the pricing group", () => {
    renderWithConfig(<EventForm communityTag="c-1" page="settings" />);
    expect(screen.queryByText("Add ticket tier")).toBeNull();
    expect(screen.getByText(/Require Approval/)).toBeTruthy();
    expect(screen.getByText(/Who can see the guest list/)).toBeTruthy();
    expect(screen.getByText(/Who can see the location/)).toBeTruthy();
  });

  it("the ticket card always shows its facts, even unset (discoverability)", () => {
    renderWithConfig(<EventForm communityTag="c-1" page="commerce" />);
    // The seeded free tier has no capacity and no form — both still render so a
    // host sees the features exist behind the card.
    expect(screen.getByText("Capacity")).toBeTruthy();
    expect(screen.getByText("Unlimited")).toBeTruthy();
    expect(screen.getByText("Sign-up form")).toBeTruthy();
    expect(screen.getByText("Not set")).toBeTruthy();
  });
});
