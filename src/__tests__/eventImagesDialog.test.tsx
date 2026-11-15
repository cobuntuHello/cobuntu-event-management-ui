import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";

/*
 * An existing event's photos from the manage page (backend
 * docs/features/event-gallery.md): opens on the cover and the gallery, saves
 * the new order through the event update (first = cover), and reads the
 * community's rules from the config when given, else from the API. The
 * photo manager itself is the shared one (tested in management-ui-shared);
 * it is stubbed here to report what it is given and to reorder.
 */

vi.mock("@cobuntu/management-ui-shared", async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    MediaManager: (p: any) => (
      <div data-testid="media" data-max={p.maxItems} data-notice={p.rules?.notice ?? ""} data-tick={p.rules?.requireConfirmation ? "yes" : "no"}>
        <button type="button" onClick={() => p.onChange([p.items[1], p.items[0], ...p.items.slice(2)])}>swap first two</button>
      </div>
    ),
  };
});

import { EventManagementConfigProvider } from "../config";
import { EventImagesDialog } from "../components/EventImagesDialog";

const RULES = {
  minEdge: 1080,
  requireConfirmation: true,
  confirmationText: "I hold the rights to these images, and none is AI-generated.",
  notice: "High-resolution photos only.",
  blockAiLabelled: true,
};

function setup(extra: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (String(url).endsWith("/event-image-rules")) return new Response(JSON.stringify({ rules: null }));
    return new Response(JSON.stringify({ updatedEvents: [] }));
  }));
  const onSaved = vi.fn();
  render(
    <EventManagementConfigProvider
      value={{ apiBaseUrl: "http://api.test", authHeaders: () => ({}), stripeConnectUrl: () => "", navigate: () => {}, ...extra } as any}
    >
      <EventImagesDialog
        open
        onOpenChange={() => {}}
        communityTag="house"
        event={{ id: "e1", bannerUrl: "https://s/cover.jpg", gallery: [{ url: "https://s/second.jpg" }] }}
        onSaved={onSaved}
        showToast={() => {}}
      />
    </EventManagementConfigProvider>,
  );
  return { calls, onSaved };
}

beforeEach(() => vi.unstubAllGlobals());

describe("EventImagesDialog", () => {
  it("saves the new order: the first photo becomes the cover, the rest the gallery", async () => {
    const { calls, onSaved } = setup();
    const save = await screen.findByRole("button", { name: "Save" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    expect(calls[0].url).toBe("http://api.test/api/communities/house/event-image-rules");
    fireEvent.click(screen.getByRole("button", { name: "swap first two" }));
    fireEvent.click(save);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const put = calls.find((c) => c.init?.method === "PUT")!;
    expect(put.url).toBe("http://api.test/api/communities/house/events/e1");
    expect(JSON.parse(String(put.init!.body))).toEqual({ bannerUrl: "https://s/second.jpg", media: ["https://s/cover.jpg"] });
  });

  it("a same-origin host (apiBaseUrl \"\", the community app) gets the gallery and its rules", async () => {
    const { calls } = setup({ apiBaseUrl: "" });
    await waitFor(() => expect(calls.some((c) => c.url === "/api/communities/house/event-image-rules")).toBe(true));
    expect(screen.getByTestId("media").getAttribute("data-max")).toBe("8");
  });

  it("a host that says it has no upload route keeps the single cover", async () => {
    setup({ uploadEventImage: null });
    await screen.findByRole("button", { name: "Save" });
    expect(screen.getByTestId("media").getAttribute("data-max")).toBe("1");
  });

  it("uses the rules the host app passes, without asking the API", async () => {
    const { calls } = setup({ eventImageRules: RULES });
    const media = await screen.findByTestId("media");
    expect(media.getAttribute("data-notice")).toBe(RULES.notice);
    expect(media.getAttribute("data-tick")).toBe("yes");
    expect(calls.some((c) => c.url.endsWith("/event-image-rules"))).toBe(false);
  });
});
