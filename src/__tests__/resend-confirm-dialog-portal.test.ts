/**
 * Guards that the resend-payment-link confirmation dialog renders through
 * a portal to <body>.
 *
 * Regression (PBN, 2026-06-09): the dialog was the only modal in this
 * package rendered inline (no createPortal). An ancestor of the attendees
 * section establishes a containing block (transform / filter / contain),
 * so the overlay's `position: fixed` resolved relative to that box rather
 * than the viewport — pinning the card to the content area's lower-right
 * and dimming only part of the screen instead of centering. Same class of
 * bug PriceEditModal already fixed via a portal.
 *
 * This is a source-level assertion (the component imports peer deps that
 * aren't resolvable in isolation), pinning the structural invariant: the
 * dialog's return goes through createPortal(..., document.body).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(__dirname, "..", "components", "AttendeesAndInvitationsSection", "index.tsx"),
  "utf8",
);

describe("ResendConfirmDialog — portal", () => {
  it("imports createPortal from react-dom", () => {
    expect(SRC).toMatch(/import\s*\{\s*createPortal\s*\}\s*from\s*["']react-dom["']/);
  });

  it("renders the dialog through createPortal to document.body", () => {
    // Isolate the ResendConfirmDialog function body and assert it portals.
    const start = SRC.indexOf("function ResendConfirmDialog");
    expect(start).toBeGreaterThan(-1);
    const body = SRC.slice(start, SRC.indexOf("function ApprovedRow", start));
    expect(body).toContain("createPortal(");
    expect(body).toMatch(/document\.body/);
    // The full-viewport overlay must still be present.
    expect(body).toMatch(/fixed inset-0/);
  });
});
