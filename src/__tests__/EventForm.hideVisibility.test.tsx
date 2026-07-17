import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { EventForm } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * The `hideVisibility` prop drops the members-only community gates
 * (Visibility + Attendance) for member submissions in the community-app
 * create flow, while keeping the seller-owned "Require Approval" control.
 * Leaders creating in-context omit the prop and configure the gates inline.
 */
describe("EventForm — hideVisibility gating", () => {
  beforeEach(() => {
    // useStripeStatus fetches /stripe/connected on mount.
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: false } }]);
  });

  it("shows Visibility + Attendance by default (leader view)", () => {
    renderWithConfig(<EventForm communityTag="c-1" />);
    expect(screen.getByText(/Visibility:/)).toBeTruthy();
    expect(screen.getByText(/Attendance:/)).toBeTruthy();
    expect(screen.getByText(/Require Approval/)).toBeTruthy();
  });

  it("hides Visibility + Attendance when hideVisibility, keeps Require Approval (member view)", () => {
    renderWithConfig(<EventForm communityTag="c-1" hideVisibility />);
    expect(screen.queryByText(/Visibility:/)).toBeNull();
    expect(screen.queryByText(/Attendance:/)).toBeNull();
    expect(screen.getByText(/Require Approval/)).toBeTruthy();
  });
});
