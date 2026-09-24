import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithConfig } from "./test-utils";
import { EventForm } from "../components/EventForm";
import { LISTING_NAME_MAX, listingNameTooLong } from "../lib/listingNameLimit";

/**
 * A listing name is a title, and nothing used to say so.
 *
 * `events.name` is unbounded Postgres `text` and services/core checked only
 * that a name was PRESENT, so a seller pasted a whole Instagram caption into
 * the field on a live community: 1399 characters, emoji and trailing URL. It
 * rendered as an <h1> and pushed the price and buy buttons below the fold.
 *
 * The deliberate choice under test is that this is a COUNTER, not a
 * `maxLength`. `maxLength` would have taken that paste, kept its first 100
 * characters, cut it mid-sentence and said nothing -- turning a visible mess
 * into an invisible one. So the tests below check that the long value is still
 * in the field, and that the form says what is wrong with it.
 */

const base = { communityTag: "c-1" };

const nameInput = () => screen.getByPlaceholderText("Event Name") as HTMLInputElement;

/** The real caption that prompted the cap, trimmed. */
const CAPTION =
  "O seu filho tem capacidade. Mas será que está a conseguir mostrar tudo aquilo de que é capaz? "
  + "O ano letivo começa com boas intenções. Depois chegam as rotinas, o telemóvel, o estudo adiado.";

describe("the event name is capped at a title's length", () => {
  it("says nothing at all about length for an ordinary title", () => {
    renderWithConfig(<EventForm {...base} onChange={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: "Ceramic mug" } });
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/too many/)).not.toBeInTheDocument();
  });

  it("starts counting down only in the last stretch of the budget", () => {
    renderWithConfig(<EventForm {...base} onChange={vi.fn()} />);
    // 15 short of the cap: inside the final fifth, so the counter appears.
    fireEvent.change(nameInput(), { target: { value: "x".repeat(LISTING_NAME_MAX - 15) } });
    expect(screen.getByText("15 left")).toBeInTheDocument();
  });

  it("says how much has to go once the name is over", () => {
    renderWithConfig(<EventForm {...base} onChange={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: "x".repeat(LISTING_NAME_MAX + 12) } });
    expect(screen.getByText(/12 too many/)).toBeInTheDocument();
  });

  it("keeps the whole paste in the field rather than silently truncating it", () => {
    /*
     * The heart of it. A seller who pasted a caption must still be holding
     * their text -- so they can cut it themselves, or copy it into the
     * description where it belonged. maxLength would have thrown most of it
     * away before they ever saw it.
     */
    const onChange = vi.fn();
    renderWithConfig(<EventForm {...base} onChange={onChange} />);
    fireEvent.change(nameInput(), { target: { value: CAPTION } });

    expect(nameInput().value).toBe(CAPTION);
    expect(nameInput().value.length).toBeGreaterThan(LISTING_NAME_MAX);
    expect(screen.getByText(/too many/)).toBeInTheDocument();
  });

  it("marks the field invalid, so the submit gate and screen readers agree", () => {
    renderWithConfig(<EventForm {...base} onChange={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: CAPTION } });
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(nameInput(), { target: { value: "Ceramic mug" } });
    expect(nameInput()).not.toHaveAttribute("aria-invalid");
  });
});

describe("listingNameTooLong", () => {
  it("mirrors the server's ceiling", () => {
    expect(LISTING_NAME_MAX).toBe(100);
  });

  it("measures the trimmed name, so trailing spaces cannot fail a valid title", () => {
    expect(listingNameTooLong("x".repeat(LISTING_NAME_MAX) + "   ")).toBe(false);
    expect(listingNameTooLong("x".repeat(LISTING_NAME_MAX + 1))).toBe(true);
  });
});
