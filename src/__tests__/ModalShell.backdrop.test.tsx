import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModalShell } from "../page/helpers";

/**
 * The backdrop must close the modal only for a click that started on it.
 *
 * A press inside the modal released over the backdrop makes the browser fire
 * `click` on the backdrop (their common ancestor). That used to close the tier
 * editor mid-edit and lose the question being written (Impact Hub Porto,
 * 2026-11-06). jsdom does not synthesise that click, so the tests dispatch the
 * mousedown/click pair the browser would.
 */
function setup() {
  const onClose = vi.fn();
  render(
    <ModalShell onClose={onClose}>
      <input aria-label="Question label" />
    </ModalShell>,
  );
  return { onClose, backdrop: screen.getByTestId("modal-backdrop"), input: screen.getByLabelText("Question label") };
}

describe("ModalShell backdrop", () => {
  it("closes on a click that starts and ends on the backdrop", () => {
    const { onClose, backdrop } = setup();
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close when the press started inside the modal and was released over the backdrop", () => {
    const { onClose, backdrop, input } = setup();
    fireEvent.mouseDown(input);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does NOT close on clicks inside the modal", () => {
    const { onClose, input } = setup();
    fireEvent.mouseDown(input);
    fireEvent.click(input);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a drag-out does not arm the next click: a later inside press still cannot close it", () => {
    const { onClose, backdrop, input } = setup();
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop); // a genuine close
    fireEvent.mouseDown(input);
    fireEvent.click(backdrop); // drag-out afterwards
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
