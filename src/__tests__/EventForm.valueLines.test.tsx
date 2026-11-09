import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { EventForm } from "../components/EventForm";
import { renderWithConfig, mockFetch } from "./test-utils";

/**
 * What buyers get, each line with a value (PBN feedback L2). A row on the
 * listing step opens the shared ValueLinesModal (the same editor products use);
 * the form emits the lines in cents, and omits the field until there are some,
 * so an untouched create never sends an empty list.
 */
function lastEmit(onChange: ReturnType<typeof vi.fn>) {
  const calls = onChange.mock.calls;
  return calls.length ? calls[calls.length - 1][0] : null;
}

describe("EventForm — what buyers get (value lines)", () => {
  beforeEach(() => {
    mockFetch([{ url: /\/stripe\/connected/, body: { connected: false } }]);
  });

  it("omits valueLines until the host adds some", () => {
    const onChange = vi.fn();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} page="listing" />);
    expect(screen.getByText("Add what buyers get")).toBeInTheDocument();
    expect(lastEmit(onChange)).not.toHaveProperty("valueLines");
  });

  it("emits the lines in cents after Save, and the row summarises them", async () => {
    const onChange = vi.fn();
    renderWithConfig(<EventForm communityTag="c-1" onChange={onChange} page="listing" />);

    fireEvent.click(screen.getByText("Add what buyers get"));
    fireEvent.change(screen.getByLabelText("Line 1 description"), { target: { value: "Networking brunch" } });
    fireEvent.change(screen.getByLabelText("Line 1 value"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(lastEmit(onChange).valueLines).toEqual([{ label: "Networking brunch", value: 6000 }]));
    expect(screen.getByText("What buyers get")).toBeInTheDocument();
    expect(screen.getByText(/1 line · .*60.* total value/)).toBeInTheDocument();
  });
});
