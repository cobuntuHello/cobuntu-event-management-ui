import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarkdownEditor } from "../ui/markdown-editor";

/**
 * The textarea IS the value — markdown source, never HTML. The overlay is a
 * read-only preview rendered from that same text; this just checks it marks
 * up the handful of inline/block forms we claim to support, and that the
 * textarea underneath still carries the raw, unformatted value (so typing,
 * selection and copy/paste see the real source, not the preview).
 */

describe("MarkdownEditor", () => {
  it("renders the raw value in the textarea untouched", () => {
    render(<MarkdownEditor value="**bold** text" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("**bold** text");
  });

  it("bolds **text** in the overlay while keeping the markers visible", () => {
    const { container } = render(<MarkdownEditor value="**bold**" onChange={vi.fn()} />);
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("bold");
    expect(container.textContent).toContain("**bold**");
  });

  it("italicizes *text*", () => {
    const { container } = render(<MarkdownEditor value="*hi*" onChange={vi.fn()} />);
    expect(container.querySelector("em")?.textContent).toBe("hi");
  });

  it("strikes ~~text~~", () => {
    const { container } = render(<MarkdownEditor value="~~gone~~" onChange={vi.fn()} />);
    expect(container.querySelector("del")?.textContent).toBe("gone");
  });

  it("renders a heading line larger/bolder", () => {
    const { container } = render(<MarkdownEditor value="# Title" onChange={vi.fn()} />);
    expect(container.innerHTML).toContain("Title");
    expect(container.querySelector(".font-bold")).not.toBeNull();
  });

  it("marks up an inline code span without reformatting its contents", () => {
    const { container } = render(<MarkdownEditor value="`**not bold**`" onChange={vi.fn()} />);
    const code = container.querySelector("code");
    expect(code?.textContent).toBe("**not bold**");
    expect(code?.querySelector("strong")).toBeNull();
  });

  it("calls onChange with the typed value", () => {
    const onChange = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "new text" } });
    expect(onChange).toHaveBeenCalledWith("new text");
  });

  it("disables the textarea when disabled is passed", () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
