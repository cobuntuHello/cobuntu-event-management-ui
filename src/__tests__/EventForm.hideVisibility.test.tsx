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
    // Copy changed with the tier picker: the binary "Visibility: Everyone"
    // toggle became a question with a list under it.
    expect(screen.getByText("Who can see it")).toBeTruthy();
    expect(screen.getByText("Who can register")).toBeTruthy();
    expect(screen.getByText(/Require Approval/)).toBeTruthy();
  });

  it("hides Visibility + Attendance when hideVisibility, keeps Require Approval (member view)", () => {
    renderWithConfig(<EventForm communityTag="c-1" hideVisibility />);
    expect(screen.queryByText("Who can see it")).toBeNull();
    expect(screen.queryByText("Who can register")).toBeNull();
    expect(screen.getByText(/Require Approval/)).toBeTruthy();
  });
});
