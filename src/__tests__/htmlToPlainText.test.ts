import { describe, it, expect } from "vitest";
import { htmlToPlainText } from "../lib/htmlToPlainText";

describe("htmlToPlainText", () => {
  it("decodes &nbsp; to spaces (the reported bug)", () => {
    expect(htmlToPlainText("Two&nbsp;communities.&nbsp;One&nbsp;room.")).toBe(
      "Two communities. One room.",
    );
  });

  it("strips tags and keeps word spacing", () => {
    expect(htmlToPlainText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
    expect(htmlToPlainText("<div>a</div><div>b</div>")).toBe("a b");
  });

  it("decodes the common named entities", () => {
    expect(htmlToPlainText("A &amp; B &lt;3 &quot;x&quot; &#39;y&#39;")).toBe(
      'A & B <3 "x" \'y\'',
    );
  });

  it("decodes numeric + hex entities", () => {
    expect(htmlToPlainText("&#65;&#x42;")).toBe("AB");
  });

  it("handles empty / null / undefined", () => {
    expect(htmlToPlainText("")).toBe("");
    expect(htmlToPlainText(null)).toBe("");
    expect(htmlToPlainText(undefined)).toBe("");
  });

  it("does not double-decode &amp;", () => {
    // &amp;nbsp; should become "&nbsp;" (literal), not a space.
    expect(htmlToPlainText("a &amp;nbsp; b")).toBe("a &nbsp; b");
  });
});

/**
 * Regression guard for the create form specifically. htmlToPlainText was added
 * for the EDIT drawer and EventForm kept its own inline `replace(/<[^>]*>/g)`,
 * so the bug stayed live on the create surface for the whole time the helper
 * existed. Asserting the exact string a member reported keeps that from
 * silently coming back if someone reintroduces an inline strip.
 */
describe("EventForm description preview (reported 2026-08-08)", () => {
  it("does not leak &nbsp; into the collapsed row", () => {
    const fromEditor = "<p>Test&nbsp;product Test&nbsp;product</p>";
    const preview = htmlToPlainText(fromEditor);
    expect(preview).toBe("Test product Test product");
    expect(preview).not.toContain("&nbsp;");
    expect(preview).not.toContain("&");
  });
});
