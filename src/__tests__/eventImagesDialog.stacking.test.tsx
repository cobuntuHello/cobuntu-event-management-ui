import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";

/*
 * The manage page's photo dialog with the REAL shared photo manager inside it
 * (the other EventImagesDialog tests stub it). What is under test is the
 * nesting: the manager opens its own upload modal from inside this dialog.
 *
 * Impact Hub Porto's host, 2026-11-27: on an event with no photos she pressed
 * "Add photos", the upload modal opened BEHIND the dialog (a Radix Dialog at
 * z-[130] over the shared shell's z-[120]), and Radix's modal mode blocked
 * every pointer event outside its own content. The picker was visible, dimmed
 * and unreachable, and no photo could be chosen.
 *
 * happy-dom does not stack by z-index, so the test pins the conditions that
 * decide it in a browser: both modals on the same layer, the upload modal
 * later in the same portal target (so it paints on top), nothing that disables
 * pointer events or hides it from assistive tech, and its controls working.
 */

import { EventManagementConfigProvider } from "../config";
import { EventImagesDialog } from "../components/EventImagesDialog";

function setup() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).endsWith("/event-image-rules")) return new Response(JSON.stringify({ rules: null }));
    return new Response(JSON.stringify({ updatedEvents: [] }));
  }));
  const onOpenChange = vi.fn();
  render(
    <EventManagementConfigProvider
      value={{ apiBaseUrl: "http://api.test", authHeaders: () => ({}), stripeConnectUrl: () => "", navigate: () => {} } as any}
    >
      <EventImagesDialog
        open
        onOpenChange={onOpenChange}
        communityTag="impact-hub-porto"
        event={{ id: "e2", bannerUrl: null, gallery: [] }}
        onSaved={() => {}}
        showToast={() => {}}
      />
    </EventManagementConfigProvider>,
  );
  return { onOpenChange };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.restoreAllMocks());

async function openUploadModal() {
  // The rules load first; until then the manager is disabled.
  const add = await screen.findByRole("button", { name: /Add photos/ });
  await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(add);
  return screen.findByRole("button", { name: "Choose from your device" });
}

describe("EventImagesDialog: the upload modal opens on top of it", () => {
  it("stacks the upload modal above the photo dialog, on the same layer and later in the same target", async () => {
    setup();
    await openUploadModal();
    const backdrops = Array.from(document.querySelectorAll('[data-testid="modal-backdrop"]'));
    expect(backdrops).toHaveLength(2);
    const [dialog, upload] = backdrops;
    expect(dialog.textContent).toContain("Event Image");
    expect(upload.textContent).toContain("Choose from your device");
    // Same layer, so document order decides: the one opened second paints on top.
    expect(dialog.className).toContain("z-[120]");
    expect(upload.className).toContain("z-[120]");
    expect(dialog.parentElement).toBe(upload.parentElement);
    expect(dialog.compareDocumentPosition(upload) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No higher layer anywhere (the Radix overlay was z-[130]).
    expect(document.querySelector('[class*="z-[130]"]')).toBeNull();
  });

  it("leaves the upload modal clickable and visible to assistive tech", async () => {
    setup();
    const choose = await openUploadModal();
    // Radix's modal mode set these on the page while the dialog was open.
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(choose.closest('[aria-hidden="true"]')).toBeNull();
    expect(choose.closest("[inert]")).toBeNull();
  });

  it("choosing from the device opens the file picker, and the photo dialog stays open", async () => {
    const { onOpenChange } = setup();
    const choose = await openUploadModal();
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    fireEvent.mouseDown(choose);
    fireEvent.click(choose);
    expect(click).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes from its own Cancel", async () => {
    const { onOpenChange } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
