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

  it("does not let the italic pass re-match a bold span's own ** marker text", () => {
    // Regression: **bold** renders its own literal "**" marker characters
    // into the overlay. Before the delimiters were masked behind placeholder
    // tokens, the italic regex ran AFTER the bold regex on that same string
    // and matched across those rendered "**" characters, nesting a stray
    // <em> inside what should be a single, unbroken <strong>.
    const { container } = render(<MarkdownEditor value="**bold** and **more bold**" onChange={vi.fn()} />);
    const strongs = container.querySelectorAll("strong");
    expect(strongs).toHaveLength(2);
    expect(strongs[0].textContent).toBe("bold");
    expect(strongs[1].textContent).toBe("more bold");
    expect(container.querySelector("em")).toBeNull();
  });

  it("does not let the italic pass re-match a strikethrough span's own ~~ marker text", () => {
    const { container } = render(<MarkdownEditor value="~~gone~~ and ~~also gone~~" onChange={vi.fn()} />);
    const dels = container.querySelectorAll("del");
    expect(dels).toHaveLength(2);
    expect(container.querySelector("em")).toBeNull();
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
