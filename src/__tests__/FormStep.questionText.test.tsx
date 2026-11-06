import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditFieldFlow, withQuestionText } from "../components/PriceEditModal/sub-flows/EditFieldFlow";
import { makeBlankField } from "../components/PriceEditModal/_form-types";
import { answerText } from "../components/AttendeesAndInvitationsSection/answerText";
import { renderWithConfig } from "./test-utils";

/**
 * Impact Hub Porto, 2026-11-06: the question box was pre-filled with the type
 * name, so the host wrote every question in Help text and attendees saw
 * "Short Text" / "Multiple Choice" as titles. And the host's view of choice
 * answers showed option ids.
 */
describe("EditFieldFlow — the question text", () => {
  it("starts empty and will not add a question without its text", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithConfig(
      <EditFieldFlow field={makeBlankField("SHORT_TEXT")} isNew onSave={onSave} onDelete={() => {}} onBack={() => {}} />,
    );
    const q = screen.getByLabelText("Question") as HTMLInputElement;
    expect(q.value).toBe("");
    expect(q.placeholder).toBe("What should the question read?");

    await user.click(screen.getByRole("button", { name: /Add question/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Write the question first.");

    await user.type(q, "Where are you originally from?");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Add question/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ label: "Where are you originally from?" }));
  });
});

describe("withQuestionText (the modal-Save flush)", () => {
  const base = { id: "f", type: "SHORT_TEXT" as const, required: false };

  it("keeps a written question", () => {
    expect(withQuestionText({ ...base, label: " Diet? " }, "Short Text").label).toBe("Diet?");
  });

  it("promotes help text to the question when the question box was left empty", () => {
    const f = withQuestionText({ ...base, label: "", description: "Where are you originally from?" }, "Short Text");
    expect(f.label).toBe("Where are you originally from?");
    expect(f.description).toBeUndefined();
  });

  it("falls back to the type name rather than dropping the question", () => {
    expect(withQuestionText({ ...base, label: "" }, "Short Text").label).toBe("Short Text");
  });
});

describe("answerText (attendees CSV)", () => {
  const coworking = {
    id: "q", type: "MULTIPLE_CHOICE",
    options: [{ id: "opt-1", label: "Yes, all day" }, { id: "opt-2", label: "No, thank you" }],
  };

  it("writes option labels, not ids", () => {
    expect(answerText(coworking, ["opt-1", "opt-2"])).toBe("Yes, all day, No, thank you");
    expect(answerText({ ...coworking, type: "SINGLE_CHOICE" }, "opt-2")).toBe("No, thank you");
  });

  it("falls back to the id for a removed option, and passes text through", () => {
    expect(answerText(coworking, ["opt-9"])).toBe("opt-9");
    expect(answerText({ id: "t", type: "SHORT_TEXT" }, "Porto")).toBe("Porto");
    expect(answerText({ id: "r", type: "RATING" }, 4)).toBe("4");
    expect(answerText(undefined, "")).toBe("");
  });
});

